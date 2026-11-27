<?php

namespace App\Services\Assistant;

use Anthropic\Client;
use App\Models\User;
use App\Support\Access;
use Carbon\CarbonImmutable;

/**
 * The in-app assistant: answers questions about the system and its data in Arabic,
 * looking things up through Gateway as the person who asked.
 */
class Assistant
{
    public function __construct(private readonly Gateway $gateway) {}

    public static function enabled(): bool
    {
        return filled(config('assistant.api_key'));
    }

    /**
     * @param  array<int, array{role: string, content: string}>  $history  earlier turns, oldest first, ending with the new question
     * @return array{answer: string, lookups: int}
     */
    public function ask(User $user, array $history): array
    {
        $messages = array_map(fn ($m) => ['role' => $m['role'], 'content' => $m['content']], $history);
        $lookups = 0;
        $max = max(1, (int) config('assistant.max_steps'));

        for ($step = 0; ; $step++) {
            $last = $step >= $max;
            $response = $this->call($user, $messages, $last);

            if ($response->stopReason === 'refusal') {
                return ['answer' => 'لا أستطيع الإجابة عن هذا السؤال.', 'lookups' => $lookups];
            }

            $calls = array_values(array_filter($response->content, fn ($b) => $b->type === 'tool_use'));
            if ($response->stopReason !== 'tool_use' || ! $calls) {
                $text = implode("\n\n", array_map(fn ($b) => $b->text, array_filter($response->content, fn ($b) => $b->type === 'text')));

                return ['answer' => trim($text) ?: 'لم أجد إجابة. حاول صياغة السؤال بطريقة أخرى.', 'lookups' => $lookups];
            }

            $results = [];
            foreach ($calls as $call) {
                $lookups++;
                $path = is_array($call->input) ? (string) ($call->input['path'] ?? '') : '';
                $results[] = ['type' => 'tool_result', 'toolUseID' => $call->id, 'content' => $this->gateway->get($user, $path)];
            }
            $messages[] = ['role' => 'assistant', 'content' => $response->content];
            $messages[] = ['role' => 'user', 'content' => $results];
        }
    }

    /** One request to the model. Kept apart so tests can replace it. */
    protected function call(User $user, array $messages, bool $mustAnswer): object
    {
        $client = new Client(apiKey: config('assistant.api_key'));

        return $client->beta->messages->create(
            model: config('assistant.model'),
            maxTokens: 16000,
            system: [
                // Fixed text first and cached; what changes per person and day comes after.
                ['type' => 'text', 'text' => $this->instructions(), 'cacheControl' => ['type' => 'ephemeral']],
                ['type' => 'text', 'text' => $this->context($user).($mustAnswer ? "\n\nانتهى عدد عمليات البحث المسموح: أجب الآن بما لديك." : '')],
            ],
            tools: [$this->tool()],
            toolChoice: $mustAnswer ? ['type' => 'none'] : ['type' => 'auto'],
            outputConfig: ['effort' => config('assistant.effort')],
            // If the model declines on policy grounds, the server retries on its default substitute.
            fallbacks: 'default',
            betas: ['server-side-fallback-2026-07-01'],
            messages: $messages,
        );
    }

    private function instructions(): string
    {
        $guide = file_get_contents(resource_path('assistant/guide.md'));

        return <<<TXT
أنت «المساعد» داخل نظام إدارة المكاتب لشركة أبناء فارس أبو زايد. يسألك الموظفون والمديرون وشؤون الموظفين والإدارة عن النظام وبياناته.

طريقة العمل:
- أجب بالعربية الفصحى المبسطة، باختصار ووضوح، وابدأ بالجواب نفسه.
- إذا كان السؤال عن بيانات (موظفين، حضور، إجازات، رواتب، مهام، فروع…)، فاستخدم أداة query_system لجلبها، ولا تخمّن أرقاماً أو أسماء. يمكنك إجراء أكثر من بحث.
- إذا كان السؤال «كيف أعمل كذا؟»، فاشرح الخطوات من دليل النظام أدناه، واذكر الصفحة برابط.
- تعمل بصلاحيات السائل فقط. إذا رجعت الأداة «ممنوع»، فقل له بلطف إن هذه البيانات خارج صلاحياته، ولا تحاول الالتفاف على ذلك.
- لا تملك تنفيذ إجراءات (إضافة، تعديل، اعتماد، إرسال). إذا طُلب منك إجراء، فاشرح كيف يفعله السائل بنفسه، وأعطه رابط الصفحة.
- أرقام الهويات والحسابات البنكية محجوبة عنك عمداً؛ إذا سُئلت عنها فوجّه السائل إلى ملف الموظف.
- الروابط بصيغة Markdown ومسارها داخلي، مثل [الرواتب](/payroll) أو [ملف أحمد](/employees/12).
- للقوائم الطويلة استخدم جدول Markdown قصيراً أو نقاطاً. استخدم الأرقام الغربية (0-9) والتواريخ بصيغة 2026-11-27 أو «27 نوفمبر».
- إذا لم تجد المعلومة، فقل ذلك بوضوح واقترح أين يمكن البحث.

# دليل النظام

{$guide}
TXT;
    }

    private function context(User $user): string
    {
        $user->loadMissing('role', 'branch');
        $now = CarbonImmutable::now(config('app.business_timezone', 'Asia/Gaza'));
        $perms = collect(Access::effective($user))->map(fn ($scope, $key) => "{$key}:{$scope}")->implode('، ');

        return implode("\n", [
            '# السائل',
            "الاسم: {$user->name} (رقم المستخدم {$user->id})",
            'الدور: '.($user->role?->name ?? '—'),
            'الفرع: '.($user->branch ? "{$user->branch->name} (رقم {$user->branch->id})" : 'الإدارة العامة، دون فرع'),
            'صلاحياته (الصلاحية:النطاق): '.($perms ?: 'لا صلاحيات إضافية؛ يرى بياناته فقط'),
            'الآن: '.$now->format('Y-m-d H:i').' ('.$now->locale('ar')->dayName.')',
        ]);
    }

    private function tool(): array
    {
        return [
            'name' => 'query_system',
            'description' => <<<'TXT'
يجلب بيانات من النظام بصلاحيات السائل (قراءة فقط). مرّر المسار مع معاملات الاستعلام، مثل: users?search=أحمد

المسارات المتاحة:
- dashboard: ملخص اليوم للسائل (رسائل غير مقروءة، مهام، حضور الفروع، رواتب، ما ينتظر قراره).
- dashboard/branch-operations: تشغيل فرع السائل اليوم.
- branches: الفروع. branches/{id}: تفاصيل فرع.
- users?search=&branch_id=&role=&status=active|inactive: الموظفون والحسابات (الأدوار: super_admin, management, hr, finance, branch_manager, employee).
- users/{id}: حساب واحد.
- employees/{id}: ملف موظف (العمل والأجر، الحالة، رصيد الإجازة، البيانات الشخصية دون الأرقام الحساسة).
- employees/{id}/overview?month=YYYY-MM: تقويم حضور الموظف في الشهر، ودفعاته، وعدد إجازاته.
- leaves: طلبات الإجازة والأذونات (الحالة: pending بانتظار القرار، escalated عند الإدارة، approved، rejected، cancelled).
- attendance/me: حضور السائل.
- attendance/board?branch_id=&date=YYYY-MM-DD: حضور فرع في يوم (من حضر، من تأخر، من لم يأتِ).
- attendance/overview?date=YYYY-MM-DD: ملخص حضور كل الفروع في يوم.
- attendance/days?from=YYYY-MM-DD&to=YYYY-MM-DD&branch_id=&user_id=: أيام الحضور المفصلة (أقصى مدة 3 أشهر).
- payroll/mine: رواتب السائل.
- payroll/batches: دفعات الرواتب (الحالة draft مسودة، approved معتمدة، paid مصروفة). payroll/batches/{id}: تفاصيل دفعة وموظفيها.
- payroll/settings، payroll/adjustments، payroll/advances: قواعد الحساب، والخصومات والمكافآت، والسلف.
- tasks?branch_id=&all_branches=1: المهام الميدانية. tasks/mine: مهام السائل. tasks/archive. tasks/{id}.
- messages?folder=inbox|sent|archive&search=: قائمة رسائل السائل (العنوان ومقتطف).
- reports?from=YYYY-MM-DD&to=YYYY-MM-DD&branch_id=: تقارير التشغيل لفرع.
- shell/search?q=: بحث سريع عن أشخاص ومهام ومشتركين.
- audit?page=1&action=payroll.: سجل الحركات (من فعل ماذا ومتى).
- holidays، departments، schedules: العطل والأقسام والدوامات.
- generation/YYYY-MM-DD، distribution/YYYY-MM-DD: تقرير التوليد أو كشف التوزيع ليوم.
- seals، seals/history: الأختام.

ابحث عن الشخص أولاً بـ users?search= لتعرف رقمه، ثم افتح ملفه أو حضوره.
TXT,
            'inputSchema' => [
                'type' => 'object',
                'properties' => [
                    'path' => ['type' => 'string', 'description' => 'المسار مع معاملات الاستعلام، دون /api'],
                ],
                'required' => ['path'],
                'additionalProperties' => false,
            ],
            'strict' => true,
        ];
    }
}
