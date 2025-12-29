export function getPrompts(config) {
  const prompts = [];

  if (!config.name) {
    prompts.push({
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: 'my-open-lovable',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Project name is required';
        }
        if (!/^[a-z0-9-_]+$/i.test(input)) {
          return 'Project name can only contain letters, numbers, hyphens, and underscores';
        }
        return true;
      }
    });
  }

  if (!config.sandboxBackend) {
    prompts.push({
      type: 'list',
      name: 'sandboxBackend',
      message: 'Choose your sandbox backend (via ComputeSDK):',
      choices: [
        {
          name: 'E2B - Full-featured development sandboxes',
          value: 'e2b',
          short: 'E2B'
        },
        {
          name: 'Vercel - Lightweight ephemeral VMs',
          value: 'vercel',
          short: 'Vercel'
        },
        {
          name: 'Modal - Serverless cloud compute',
          value: 'modal',
          short: 'Modal'
        },
        {
          name: 'Daytona - Development environments',
          value: 'daytona',
          short: 'Daytona'
        }
      ],
      default: 'e2b'
    });
  }

  prompts.push({
    type: 'confirm',
    name: 'configureEnv',
    message: 'Would you like to configure API keys now?',
    default: true
  });

  return prompts;
}

export function getEnvPrompts(sandboxBackend) {
  const prompts = [];

  // ComputeSDK API key (always required)
  prompts.push({
    type: 'input',
    name: 'computeSdkApiKey',
    message: 'ComputeSDK API key (https://computesdk.com):',
    validate: (input) => {
      if (!input || input.trim() === '') {
        return 'ComputeSDK API key is required';
      }
      return true;
    }
  });

  // Firecrawl API key
  prompts.push({
    type: 'input',
    name: 'firecrawlApiKey',
    message: 'Firecrawl API key (for web scraping):',
    validate: (input) => {
      if (!input || input.trim() === '') {
        return 'Firecrawl API key is required for web scraping functionality';
      }
      return true;
    }
  });

  // Sandbox backend credentials based on selection
  if (sandboxBackend === 'e2b') {
    prompts.push({
      type: 'input',
      name: 'e2bApiKey',
      message: 'E2B API key:',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'E2B API key is required';
        }
        return true;
      }
    });
  } else if (sandboxBackend === 'vercel') {
    prompts.push({
      type: 'list',
      name: 'vercelAuthMethod',
      message: 'Vercel authentication method:',
      choices: [
        {
          name: 'OIDC Token (run `vercel link` then `vercel env pull`)',
          value: 'oidc',
          short: 'OIDC'
        },
        {
          name: 'Personal Access Token',
          value: 'pat',
          short: 'PAT'
        }
      ]
    });

    prompts.push({
      type: 'input',
      name: 'vercelTeamId',
      message: 'Vercel Team ID:',
      when: (answers) => answers.vercelAuthMethod === 'pat',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Team ID is required for PAT authentication';
        }
        return true;
      }
    });

    prompts.push({
      type: 'input',
      name: 'vercelProjectId',
      message: 'Vercel Project ID:',
      when: (answers) => answers.vercelAuthMethod === 'pat',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Project ID is required for PAT authentication';
        }
        return true;
      }
    });

    prompts.push({
      type: 'input',
      name: 'vercelToken',
      message: 'Vercel Access Token:',
      when: (answers) => answers.vercelAuthMethod === 'pat',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Access token is required for PAT authentication';
        }
        return true;
      }
    });
  } else if (sandboxBackend === 'modal') {
    prompts.push({
      type: 'input',
      name: 'modalTokenId',
      message: 'Modal Token ID:',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Modal Token ID is required';
        }
        return true;
      }
    });

    prompts.push({
      type: 'input',
      name: 'modalTokenSecret',
      message: 'Modal Token Secret:',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Modal Token Secret is required';
        }
        return true;
      }
    });
  } else if (sandboxBackend === 'daytona') {
    prompts.push({
      type: 'input',
      name: 'daytonaApiKey',
      message: 'Daytona API key:',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Daytona API key is required';
        }
        return true;
      }
    });
  }

  // Optional AI provider keys
  prompts.push({
    type: 'confirm',
    name: 'addAiKeys',
    message: 'Would you like to add AI provider API keys?',
    default: true
  });

  prompts.push({
    type: 'checkbox',
    name: 'aiProviders',
    message: 'Select AI providers to configure:',
    when: (answers) => answers.addAiKeys,
    choices: [
      { name: 'Anthropic (Claude)', value: 'anthropic' },
      { name: 'OpenAI (GPT)', value: 'openai' },
      { name: 'Google (Gemini)', value: 'gemini' },
      { name: 'Groq', value: 'groq' }
    ]
  });

  prompts.push({
    type: 'input',
    name: 'anthropicApiKey',
    message: 'Anthropic API key:',
    when: (answers) => answers.aiProviders && answers.aiProviders.includes('anthropic')
  });

  prompts.push({
    type: 'input',
    name: 'openaiApiKey',
    message: 'OpenAI API key:',
    when: (answers) => answers.aiProviders && answers.aiProviders.includes('openai')
  });

  prompts.push({
    type: 'input',
    name: 'geminiApiKey',
    message: 'Gemini API key:',
    when: (answers) => answers.aiProviders && answers.aiProviders.includes('gemini')
  });

  prompts.push({
    type: 'input',
    name: 'groqApiKey',
    message: 'Groq API key:',
    when: (answers) => answers.aiProviders && answers.aiProviders.includes('groq')
  });

  return prompts;
}