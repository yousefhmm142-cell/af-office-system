<?php

// The in-app assistant. It stays off until an Anthropic API key is set in .env.
return [
    'api_key' => env('ANTHROPIC_API_KEY'),
    'model' => env('ASSISTANT_MODEL', 'claude-opus-5-5'),
    // low = fastest answers; medium or high think longer before answering.
    'effort' => env('ASSISTANT_EFFORT', 'low'),
    // How many lookups one question may make before the assistant must answer.
    'max_steps' => (int) env('ASSISTANT_MAX_STEPS', 8),
];
