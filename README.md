# General chatbot

A public chatbot page: anyone who opens it can have a conversation with an AI model. You
control what the bot does from a password-protected admin page, and nothing needs redeploying
when you change it.

Built on [vegapunk-app](https://github.com/hauselin/vegapunk-app) by Hause Lin (MIT licence),
changed from a Qualtrics-embedded survey tool into a standalone public site.

| Page | What it's for |
| --- | --- |
| `/` | The chat visitors see |
| `/admin` | Edit the prompt, opening message, model and limits. Every save is kept as a version you can go back to |
| `/admin/transcripts` | Read every conversation, or download them all as CSV |

## How it fits together

- **SvelteKit app on Vercel.** The chat page and admin pages.
- **OpenRouter.** One API key gives access to Claude, GPT, Gemini and hundreds of other models.
  You pick the model on the admin page.
- **Turso.** A small hosted database that stores your settings, their version history and
  the transcripts. The free tier is plenty for this.

The prompt, model and API key never reach visitors' browsers. The server adds them to every
request, so nobody can use the page to run their own prompts on your key.

## Deploying (one-time setup, about 20 minutes)

### 1. OpenRouter key

1. Create a key at <https://openrouter.ai/keys>.
2. **Give the key a credit limit** (a daily or monthly one works well). The chat page is public
   and every message is paid for from this key. The limit caps what you can lose if someone
   abuses the page. When it's reached, the bot stops replying until the limit resets.

### 2. Turso database

1. Sign up at <https://turso.tech> and create a database.
2. Copy its URL (it starts with `libsql://`) and create an auth token for it.

The app creates its own tables the first time it runs, so there's nothing else to set up.

### 3. Put the code on GitHub

Create an empty repository on github.com (no README), then from this folder:

```bash
git add -A
git commit -m "Public chatbot with admin page"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

### 4. Vercel

1. At <https://vercel.com/new>, import the GitHub repository and click **Deploy** straight away.
   The app builds fine without any settings. Until you add them, the chat can't reply and
   `/admin` says login is switched off.

   Deploy before adding the variables: Vercel won't save **Secret** variables for a SvelteKit
   project until it has at least one deployment. (It reads the deployment to check that the
   variable names won't be sent to browsers.)
2. In the project, go to **Settings → Environment Variables** and add each of these as type
   **Secret**, for the **Production** environment:

   | Name | Value |
   | --- | --- |
   | `OPENROUTER_API_KEY` | the key from step 1 |
   | `ADMIN_PASSWORD` | a password of **at least 12 characters** |
   | `TURSO_DATABASE_URL` | the `libsql://...` URL from step 2 |
   | `TURSO_AUTH_TOKEN` | the token from step 2 |

3. Redeploy so the deployment picks them up: **Deployments** → the latest one → **⋯** →
   **Redeploy**.
4. Open your `.vercel.app` address plus `/admin` and log in. The **Status** box should say
   the OpenRouter key is set and the database is connected (Turso).

If you change an environment variable later, redeploy again for it to take effect. That's
only needed for these four values. Prompt and settings changes made on `/admin` are live
immediately.

## Day-to-day use

- **Changing the prompt:** go to `/admin`, edit, optionally type a note about what you changed,
  and click **Save**. The next message anyone sends uses the new version.
- **Going back to an old version:** click **Load** next to it under *Version history*, then
  **Save**.
- **Trying it out:** click **Open chat ↗**. Reload the chat page to start a fresh conversation.
- **Web search:** add `:online` to the end of the model id (e.g.
  `anthropic/claude-sonnet-5.5:online`). This costs extra per message.
- **Reading conversations:** open **Transcripts**. Each bot reply is tagged with the prompt
  version that produced it, and the CSV downloads use the same version numbers.

## Running it on your own computer

You need [Node.js](https://nodejs.org) 22.13 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:5173> (chat) and <http://localhost:5173/admin>. Local settings
live in `.env` (see `.env.example`). Without Turso details, local runs use a `local.db` file,
so you can try everything before creating any accounts except OpenRouter.

## Things to know

- **Recording notice.** Conversations are saved, and the page shows a notice saying so (edit it
  under *Page* on the admin page). Keep one there, and check what your institution or local law
  requires for storing chat data.
- **Costs are bounded but not zero.** Each visitor can send a limited number of messages (set on
  the admin page, 30 by default). The server also caps how long messages and replies can be.
  Someone determined can still open many conversations, which is why the credit limit on the
  OpenRouter key matters.
- **Search engines.** `static/robots.txt` asks search engines not to index the site, so people
  arrive through links you share. The comments in that file explain how to change it.
- **Look.** The chat keeps vegapunk's design (including the egg avatar). You can set your own
  avatar image on the admin page. Colours live in `src/lib/chatParams.ts` under `appearance`.
