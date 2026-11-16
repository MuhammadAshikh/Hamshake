# Hamshake

A calm, messaging app for email addresses from whitelisted domains. built with React, TypeScript, Vite, and Supabase. It includes email/password authentication, private one-to-one conversations, live message updates, and row-level access policies.

## Get started

1. Install Node.js 20.19+ and create a Supabase project.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project API settings.
3. Apply all SQL files in `supabase/migrations` in filename order in the Supabase SQL Editor (or with the Supabase CLI). These include the access-request flow and the limit of 50 new conversations per email domain per UTC calendar month.
4. Add the domains that are allowed to register. Run once per domain in the SQL Editor:

   ```sql
   insert into public.allowed_email_domains (domain) values ('example.org');
   ```

   Use the domain only (no `@`). The list starts empty, so sign-up is denied until a domain is added. Domain checks run in the database on both sign-up checks and auth-user creation.
5. In Supabase Authentication settings, configure the site URL and redirect URLs for your local and deployed app.
6. Run `npm install`, then `npm run dev`.

## Scripts

- `npm run dev` — start the local Vite server
- `npm run build` — type-check and create the production build
- `npm run preview` — preview the production build

## Deploy to Cloudflare Pages

1. Push this project to a Git provider supported by Cloudflare Pages, then create a Pages project in the Cloudflare dashboard and connect the repository.
2. Set the build command to `npm run build` and the build output directory to `dist`.
3. In the Pages project settings, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build environment variables for both production and preview deployments.
4. After the first deployment, set the deployed URL as the Supabase Authentication site URL and add it to the allowed redirect URLs. Add your custom domain URL there too if you configure one in Cloudflare.

The `public/_redirects` rule lets client-side app routes load directly.

## Security notes

- Do not put a Supabase service-role key in the browser app. Only the project URL and anon/publishable key belong in `.env`.
- Supabase row-level policies restrict profile updates to their owner and conversation/message access to conversation members.
- A database trigger validates allowed email domains independently of the client-side check.
- The database enforces the monthly new-conversation limit per initiating email domain; reopening an existing direct conversation does not use a slot.
- This starter supports direct, one-to-one conversations. File attachments, group chats, and account recovery are not implemented.
