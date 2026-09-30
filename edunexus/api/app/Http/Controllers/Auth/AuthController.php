<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Applicant;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * POST /api/v1/auth/register — applicant self-registration (SRS FR-001).
     * Duplicate-proof, hashed password, APPLICANT role + applicant profile
     * created atomically with a unique application number.
     */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'surname' => ['required', 'string', 'min:2', 'max:100'],
            'firstName' => ['required', 'string', 'min:2', 'max:100'],
            'middleName' => ['nullable', 'string', 'max:100'],
            'email' => ['required', 'email:rfc', 'max:255', 'unique:users,email'],
            'phone' => ['required', 'string', 'regex:/^(\+?234|0)[789][01]\d{8}$/', 'unique:users,phone'],
            'password' => ['required', 'string', Password::min(8)->letters()->numbers()],
            'passwordConfirmation' => ['required', 'string', 'same:password'],
        ]);

        $user = DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => trim($data['surname'].' '.$data['firstName'].' '.($data['middleName'] ?? '')),
                'email' => strtolower($data['email']),
                'phone' => $data['phone'],
                'password' => $data['password'], // hashed via 'hashed' cast
                'status' => 'ACTIVE',
            ]);

            $user->roles()->attach(Role::where('name', 'APPLICANT')->value('id'));

            Applicant::create([
                'user_id' => $user->id,
                'application_number' => $this->nextApplicationNumber(),
                'surname' => $data['surname'],
                'first_name' => $data['firstName'],
                'middle_name' => $data['middleName'] ?? null,
            ]);

            return $user;
        });

        $this->audit($user, 'APPLICANT_REGISTERED', 'User', $user->id);

        return response()->json([
            'ok' => true,
            'message' => 'Account created successfully. You can now log in.',
            'data' => ['id' => $user->id, 'email' => $user->email],
        ], 201);
    }

    /**
     * POST /api/v1/auth/login — email+password (all roles).
     * Lockout after 5 failed attempts for 15 minutes (SRS §44).
     */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', strtolower($data['email']))->first();

        if ($user && $user->isLocked()) {
            throw ValidationException::withMessages([
                'email' => 'Account temporarily locked after too many failed attempts. Try again later.',
            ]);
        }

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            if ($user) {
                $user->registerFailedLogin();
            }
            throw ValidationException::withMessages([
                'email' => 'Invalid email or password.',
            ]);
        }

        if (in_array($user->status, ['SUSPENDED', 'LOCKED', 'DELETED'], true)) {
            return response()->json([
                'ok' => false,
                'message' => 'This account is '.$user->status.'. Contact the administrator.',
            ], 403);
        }

        $user->registerSuccessfulLogin();
        $this->audit($user, 'LOGIN', 'User', $user->id);

        $token = $user->createToken('session', $user->roleNames(), now()->addHours(12));

        return response()->json([
            'ok' => true,
            'data' => [
                'token' => $token->plainTextToken,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'roles' => $user->roleNames(),
                ],
            ],
        ]);
    }

    /**
     * POST /api/v1/auth/logout — revoke current token.
     */
    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->audit($user, 'LOGOUT', 'User', $user->id);
        $request->user()->currentAccessToken()->delete();

        return response()->json(['ok' => true, 'message' => 'Logged out.']);
    }

    /**
     * GET /api/v1/auth/me — session profile with roles.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'ok' => true,
            'data' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'roles' => $user->roleNames(),
                'applicant' => $user->applicant()->first(),
                'student' => $user->student()->first(),
            ],
        ]);
    }

    private function nextApplicationNumber(): string
    {
        $year = now()->format('Y');
        $count = Applicant::count() + 1;

        do {
            $number = sprintf('EDU/%s/%05d', $year, $count);
            $exists = Applicant::where('application_number', $number)->exists();
            if ($exists) {
                $count++;
            }
        } while ($exists);

        return $number;
    }

}
