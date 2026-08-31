# Move Stallion Pit to another computer

The source code is stored in GitHub. Application records, authentication and
uploaded files are stored in the existing Supabase project, and production is
hosted by Vercel. Do not create new Supabase or Vercel projects when moving the
development environment.

## Before leaving the current computer

- [ ] Confirm all intended source-code changes are committed and pushed to
  `https://github.com/Ondewe123/Stallion-Pit.git`.
- [ ] Store the values from `.env.local` (or `.env`) in a password manager or
  another encrypted transfer method. Never send them by email or commit them.
- [ ] If the local raw working files under `Data/`, `Acar Old Records/`,
  `backups/`, or generated `IPC/*-combined-*` / `IPC/*-missing-*` files are
  still needed, copy them separately to encrypted storage. They are not needed
  to run the application and are intentionally excluded from GitHub.
- [ ] Confirm access to the GitHub, Supabase and Vercel accounts used by the
  project, including any required two-factor-authentication method.

## Set up the new computer

1. Install Git and the current Node.js LTS release.
2. Open PowerShell in the folder where the project should live.
3. Clone and enter the repository:

   ```powershell
   git clone https://github.com/Ondewe123/Stallion-Pit.git
   Set-Location Stallion-Pit
   ```

4. Install the exact dependency versions:

   ```powershell
   npm ci
   ```

5. Copy `.env.example` to `.env.local`:

   ```powershell
   Copy-Item .env.example .env.local
   ```

6. Open `.env.local` and replace every placeholder with the securely
   transferred value. The expected keys are:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_MAPS_API_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (only needed for maintenance/backup scripts)

7. Verify the checkout:

   ```powershell
   npm test
   npm run lint
   npm run build
   npm run dev
   ```

8. Open the local address printed by Vite (normally
   `http://localhost:5173`), sign in with the existing Stallion Pit account,
   and confirm the Dashboard shows the existing vehicles and records.

## Expected result

The new computer runs the same source code against the existing Supabase data.
GitHub and Vercel remain linked to the same project, so pushing to `main`
continues the existing production deployment workflow.

## Security follow-up

If a real service-role key has ever been committed to GitHub, rotate it in the
Supabase project settings after the new computer is working, then update the
local `.env.local` and any secure deployment environment that uses it.
