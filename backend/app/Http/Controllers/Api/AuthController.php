<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Present;
use App\Models\User;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:40'],
            'password' => ['required', 'string', 'max:100'],
            'device_name' => ['nullable', 'string', 'max:80'],
        ]);

        $cfg = config('access.login');
        $user = User::where('username', User::normalizeUsername($data['username']))->first();
        $wrong = fn () => throw ValidationException::withMessages(['username' => 'اسم المستخدم أو الرمز غير صحيح.']);

        if (! $user || ! $user->is_active) {
            $wrong();
        }

        if ($user->locked_until?->isFuture()) {
            $minutes = (int) ceil(now()->diffInSeconds($user->locked_until) / 60);

            return response()->json([
                'message' => "الحساب مقفل مؤقتاً بسبب محاولات خاطئة. حاول بعد {$minutes} دقيقة.",
                'code' => 'locked',
                'minutes' => $minutes,
            ], 423);
        }

        if (! Hash::check($data['password'], $user->password)) {
            $user->failed_logins++;
            if ($user->failed_logins >= $cfg['max_failures']) {
                $user->failed_logins = 0;
                $user->locked_until = now()->addMinutes($cfg['lock_minutes']);
            }
            $user->save();
            $wrong();
        }

        $user->forceFill(['failed_logins' => 0, 'locked_until' => null, 'last_login_at' => now()])->save();
        $token = $user->createToken($data['device_name'] ?? 'جهاز')->plainTextToken;

        return response()->json(['token' => $token, 'user' => Present::user($user, true)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => Present::user($request->user(), true), 'server_time' => now()->toIso8601String()]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:'.config('access.login.password_min'), 'max:100', 'confirmed', 'different:current_password'],
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'الرمز الحالي غير صحيح.']);
        }

        $user->forceFill([
            'password' => $data['password'],
            'must_change_password' => false,
            'handoff_code' => null,
            'password_changed_at' => now(),
        ])->save();

        // Sign out every other phone or computer; this one stays signed in.
        $current = $user->currentAccessToken();
        $user->tokens()->when($current, fn ($q) => $q->where('id', '!=', $current->id))->delete();
        Audit::log('user.password_changed', $user);

        return response()->json(['ok' => true, 'user' => Present::user($user, true)]);
    }
}
