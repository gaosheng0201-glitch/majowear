-- Seed testing user account for local development
-- User: gaosheng1@qq.com
-- UUID: dbfde66d-458a-4146-a4c0-54aa6b3689a4

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'dbfde66d-458a-4146-a4c0-54aa6b3689a4',
  'authenticated',
  'authenticated',
  'gaosheng1@qq.com',
  -- bcrypt hash for '123456'
  '$2a$10$U.4gA5c7T1Vz7J3PzN16reDkR5/KkWXG4m7h/t19c4.2h1k4KzQ4.',
  NOW(),
  NULL,
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
);

INSERT INTO auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'dbfde66d-458a-4146-a4c0-54aa6b3689a4',
  'dbfde66d-458a-4146-a4c0-54aa6b3689a4',
  'dbfde66d-458a-4146-a4c0-54aa6b3689a4',
  '{"sub":"dbfde66d-458a-4146-a4c0-54aa6b3689a4","email":"gaosheng1@qq.com"}',
  'email',
  NOW(),
  NOW(),
  NOW()
);
