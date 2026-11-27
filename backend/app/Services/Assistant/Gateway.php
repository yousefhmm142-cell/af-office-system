<?php

namespace App\Services\Assistant;

use App\Models\User;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Throwable;

/**
 * How the assistant reads the system: only through the same GET endpoints the
 * pages use, as the person who asked. Their permissions and branch limits apply
 * unchanged, so the assistant can never see more than they can.
 */
class Gateway
{
    /** Read-only endpoints the assistant may call (no downloads, no side effects). */
    public const ALLOWED = [
        '#^dashboard$#', '#^dashboard/branch-operations$#',
        '#^branches$#', '#^branches/\d+$#',
        '#^users$#', '#^users/\d+$#',
        '#^employees/\d+$#', '#^employees/\d+/overview$#',
        '#^leaves$#',
        '#^attendance/(me|overview|board|days)$#',
        '#^payroll/(mine|batches|settings|adjustments|advances)$#', '#^payroll/batches/\d+$#',
        '#^tasks$#', '#^tasks/(mine|archive)$#', '#^tasks/\d+$#',
        '#^messages$#',
        '#^reports$#', '#^shell/search$#', '#^audit$#',
        '#^holidays$#', '#^departments$#', '#^schedules$#',
        '#^generation/\d{4}-\d{2}-\d{2}$#', '#^distribution/\d{4}-\d{2}-\d{2}$#', '#^seals$#', '#^seals/history$#',
    ];

    /** Never handed to the model, whoever asks. */
    private const HIDDEN = [
        'national_id', 'account_number', 'account_holder_national_id', 'account_holder_phone',
        'password', 'remember_token', 'handoff_code', 'token', 'code', 'secret', 'signature', 'path', 'photo_path',
    ];

    private const MAX_CHARS = 40000;

    public function __construct(private readonly Kernel $kernel) {}

    /** Runs one lookup and returns text for the model: the JSON answer, or why it failed. */
    public function get(User $user, string $path): string
    {
        $path = ltrim(trim($path), '/');
        $path = preg_replace('#^api/#', '', $path);
        [$route, $query] = array_pad(explode('?', $path, 2), 2, '');
        if (! $this->allowed($route)) {
            return 'هذا المسار غير متاح للمساعد. استخدم أحد المسارات المذكورة في وصف الأداة.';
        }
        parse_str($query, $params);

        $original = app('request');
        try {
            $sub = Request::create('/api/'.$route, 'GET', $params);
            $sub->headers->set('Accept', 'application/json');
            $sub->setUserResolver(fn () => $user);
            // The sub-request runs as the person who asked, through the same middleware.
            auth()->guard('sanctum')->setUser($user);
            $response = $this->kernel->handle($sub);
        } catch (Throwable $e) {
            report($e);

            return 'تعذّر جلب البيانات.';
        } finally {
            app()->instance('request', $original);
            auth()->guard('sanctum')->setUser($user);
        }

        $status = $response->getStatusCode();
        $body = json_decode((string) $response->getContent(), true);
        if ($status >= 400) {
            $message = is_array($body) ? ($body['message'] ?? '') : '';

            return match (true) {
                $status === 403 => 'ممنوع: ليست لدى السائل صلاحية على هذه البيانات. '.$message,
                $status === 404 => 'غير موجود.',
                $status === 422 => 'مدخلات غير صحيحة: '.json_encode($body['errors'] ?? $message, JSON_UNESCAPED_UNICODE),
                default => "خطأ {$status}. {$message}",
            };
        }

        $json = json_encode($this->scrub($body), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (mb_strlen($json) > self::MAX_CHARS) {
            $json = mb_substr($json, 0, self::MAX_CHARS).' …[قُطعت النتيجة لطولها؛ ضيّق البحث بالمعاملات]';
        }

        return $json;
    }

    public function allowed(string $route): bool
    {
        foreach (self::ALLOWED as $pattern) {
            if (preg_match($pattern, $route)) {
                return true;
            }
        }

        return false;
    }

    private function scrub(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        $out = [];
        foreach ($value as $k => $v) {
            if (is_string($k) && (in_array($k, self::HIDDEN, true) || str_ends_with($k, '_token'))) {
                continue;
            }
            $out[$k] = $this->scrub($v);
        }

        return $out;
    }
}
