<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Assistant\Assistant;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class AssistantController extends Controller
{
    public function status(): JsonResponse
    {
        return response()->json(['enabled' => Assistant::enabled()]);
    }

    public function ask(Request $request, Assistant $assistant): JsonResponse
    {
        abort_unless(Assistant::enabled(), 503, 'المساعد غير مفعّل بعد. يضيف مدير النظام مفتاح ANTHROPIC_API_KEY في إعدادات الخادم.');
        $data = $request->validate([
            'messages' => ['required', 'array', 'min:1', 'max:20'],
            'messages.*.role' => ['required', 'in:user,assistant'],
            'messages.*.content' => ['required', 'string', 'max:4000'],
        ]);
        $messages = array_values($data['messages']);
        abort_unless(end($messages)['role'] === 'user', 422, 'آخر رسالة يجب أن تكون سؤالاً.');

        $user = $request->user();
        try {
            $result = $assistant->ask($user, $messages);
        } catch (Throwable $e) {
            report($e);
            abort(502, 'تعذّر الوصول إلى المساعد الآن. حاول بعد قليل.');
        }
        Audit::log('assistant.asked', $user, null, ['question' => mb_substr(end($messages)['content'], 0, 300), 'lookups' => $result['lookups']], null, $user->branch_id);

        return response()->json(['answer' => $result['answer']]);
    }
}
