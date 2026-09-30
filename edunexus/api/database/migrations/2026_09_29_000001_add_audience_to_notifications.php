<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Notifications v2 (SRS §35):
 *  - audience: USER rows are personal; STAFF rows are a single shared row
 *    broadcast to the staff portal bell (user_id stays NULL).
 *  - EMAIL rows carry the delivery attempt outcome (PENDING → SENT/FAILED)
 *    with the transport error recorded in meta.
 * The user_id FK is recreated as nullable (nullOnDelete) to hold shared rows.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        Schema::table('notifications', function (Blueprint $table) {
            $table->uuid('user_id')->nullable()->change();
            $table->enum('audience', ['USER', 'STAFF'])->default('USER')->after('user_id');
            $table->index('audience');
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex(['audience']);
            $table->dropColumn('audience');
            $table->uuid('user_id')->nullable(false)->change();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
