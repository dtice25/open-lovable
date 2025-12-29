# Open Lovable

Chat with AI to build React apps instantly. An example app made by the [Firecrawl](https://firecrawl.dev/?ref=open-lovable-github) team. For a complete cloud solution, check out [Lovable.dev](https://lovable.dev/) ❤️.

<img src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmZtaHFleGRsMTNlaWNydGdianI4NGQ4dHhyZjB0d2VkcjRyeXBucCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ZFVLWMa6dVskQX0qu1/giphy.gif" alt="Open Lovable Demo" width="100%"/>

## Setup

1. **Clone & Install**
```bash
git clone https://github.com/firecrawl/open-lovable.git
cd open-lovable
pnpm install  # or npm install / yarn install
```

2. **Add `.env.local`**

```env
# =================================================================
# REQUIRED
# =================================================================
FIRECRAWL_API_KEY=your_firecrawl_api_key    # https://firecrawl.dev
COMPUTESDK_API_KEY=your_api_key_here        # https://computesdk.com

# =================================================================
# AI PROVIDER - Choose your LLM
# =================================================================
GEMINI_API_KEY=your_gemini_api_key          # https://aistudio.google.com/app/apikey
ANTHROPIC_API_KEY=your_anthropic_api_key    # https://console.anthropic.com
OPENAI_API_KEY=your_openai_api_key          # https://platform.openai.com
GROQ_API_KEY=your_groq_api_key              # https://console.groq.com

# =================================================================
# SANDBOX BACKEND - Configure at least one
# =================================================================
# Vercel (run `vercel link` then `vercel env pull` for OIDC)
VERCEL_OIDC_TOKEN=auto_generated_by_vercel_env_pull
# Or use Personal Access Token:
# VERCEL_TEAM_ID=team_xxxxxxxxx
# VERCEL_PROJECT_ID=prj_xxxxxxxxx
# VERCEL_TOKEN=vercel_xxxxxxxxxxxx

# E2B
# E2B_API_KEY=your_e2b_api_key              # https://e2b.dev

# Modal
# MODAL_TOKEN_ID=your_token_id              # https://modal.com
# MODAL_TOKEN_SECRET=your_token_secret

# Daytona
# DAYTONA_API_KEY=your_api_key              # https://daytona.io

# =================================================================
# OPTIONAL - Fast Apply
# =================================================================
# MORPH_API_KEY=your_morphllm_api_key       # https://morphllm.com
```

3. **Run**
```bash
pnpm dev  # or npm run dev / yarn dev
```

Open [http://localhost:3000](http://localhost:3000)

## License

MIT