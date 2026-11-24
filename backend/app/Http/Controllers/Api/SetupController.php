<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Present;
use App\Services\SetupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class SetupController extends Controller
{
    public function status(SetupService $setup): JsonResponse
    {
        return response()->json(['needed' => $setup->needed()]);
    }

    public function store(Request $request, SetupService $setup): JsonResponse
    {
        if (! $setup->needed()) {
            return response()->json(['message' => 'تم تجهيز النظام من قبل.', 'code' => 'already_set_up'], 409);
        }
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'username' => ['required', 'string', 'regex:'.UserController::USERNAME_RULE],
            'password' => ['required', 'string', 'min:'.config('access.login.password_min'), 'max:100', 'confirmed'],
        ]);

        try {
            $user = $setup->createSuperAdmin($data['name'], $data['username'], $data['password']);
        } catch (RuntimeException) {
            return response()->json(['message' => 'تم تجهيز النظام من قبل.', 'code' => 'already_set_up'], 409);
        }
        $token = $user->createToken($request->input('device_name', 'جهاز'))->plainTextToken;

        return response()->json(['token' => $token, 'user' => Present::user($user, true)], 201);
    }
}
