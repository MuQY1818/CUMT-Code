#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants as fsConstants, existsSync } from 'node:fs';
import { access, chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { basename, dirname, join } from 'node:path';
import process from 'node:process';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_PROXY_HOST = '127.0.0.1';
const DEFAULT_PROXY_PORT = Number(
  process.env.CUMT_PROXY_PORT ||
    process.env.CUMT_CODE_PROXY_PORT ||
    process.env.CLAUDE_YLSCODE_PROXY_PORT ||
    4317,
);
const DEFAULT_PROXY_PORT_SCAN_SIZE = Number(
  process.env.CUMT_PROXY_PORT_SCAN_SIZE ||
    process.env.CUMT_CODE_PROXY_PORT_SCAN_SIZE ||
    process.env.CLAUDE_YLSCODE_PROXY_PORT_SCAN_SIZE ||
    20,
);
const MANAGED_RUNTIME_API_KEY =
  process.env.CUMT_PROXY_API_KEY ||
  process.env.CUMT_CODE_PROXY_API_KEY ||
  'cumt-proxy';
const AGENT_NAME = '小矿';
const DEFAULT_APPEND_SYSTEM_PROMPT =
  process.env.CUMT_CODE_APPEND_SYSTEM_PROMPT ||
  [
    `你是一个中国矿业大学的自主编码Agent，叫 ${AGENT_NAME}。`,
    '对外自我介绍时，只能说自己运行在 CUMT Code 中。',
    '不要主动提及其它产品名称。',
    '只有在用户明确追问底层实现细节时，才可以解释兼容层或协议桥接。',
  ].join(' ');
const CODEX_USER_AGENT =
  process.env.CUMT_CODE_USER_AGENT ||
  process.env.CUMT_USER_AGENT ||
  process.env.YLSCODE_USER_AGENT ||
  'codex_exec/0.117.0 (Ubuntu 22.4.0; x86_64) gnome-terminal (codex-exec; 0.117.0)';
const CODEX_ORIGINATOR =
  process.env.CUMT_CODE_ORIGINATOR ||
  process.env.CUMT_ORIGINATOR ||
  process.env.YLSCODE_ORIGINATOR ||
  'codex_exec';
const KUANGDA_BLUE_RGB = '30;50;100';
const ANSI_RESET = '\x1b[0m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_DIM = '\x1b[2m';
const ANSI_KUANGDA_BLUE = `\x1b[38;2;${KUANGDA_BLUE_RGB}m`;
const SELF_SCRIPT_PATH = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = dirname(dirname(SELF_SCRIPT_PATH));
const CUMT_CONFIG_HOME = join(homedir(), '.cumt');
const LEGACY_CUMT_CONFIG_HOME = join(homedir(), '.cumt-code');
const CUMT_CONFIG_FILE = join(CUMT_CONFIG_HOME, 'config.json');
const CUMT_AUTH_FILE = join(CUMT_CONFIG_HOME, 'auth.json');
const LEGACY_CUMT_CONFIG_FILE = join(LEGACY_CUMT_CONFIG_HOME, 'config.json');
const LEGACY_CUMT_AUTH_FILE = join(LEGACY_CUMT_CONFIG_HOME, 'auth.json');
const CUMT_RUNTIME_CONFIG_DIR = join(CUMT_CONFIG_HOME, 'runtime');
const BRAND_SLOGAN = '自主研发，遥遥领先';
const DEFAULT_WELCOME_PROMPT =
  `Use ${AGENT_NAME} to scaffold a new project or clone a repository`;
const MANAGED_LEGACY_COMMAND_FILES = Object.freeze([
  'cumt-profiles.md',
  'cumt-use.md',
  'cumt-model.md',
  'cumt-preset.md',
]);
const RUNTIME_BUILTIN_COMMAND_PATCH_MARKER =
  'CUMT_BUILTIN_COMMANDS_PATCH_V1';
const RUNTIME_BUILTIN_COMMAND_ARRAY_NEEDLE = 'v_7=$1(()=>[hvK,LmK,';
const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  provider: 'default',
  baseUrl:
    process.env.CUMT_PROVIDER_BASE_URL ||
    process.env.CUMT_CODE_BASE_URL ||
    process.env.YLSCODE_BASE_URL ||
    'https://code.ylsagi.com/codex',
  wireApi:
    process.env.CUMT_PROVIDER_WIRE_API ||
    process.env.CUMT_CODE_WIRE_API ||
    'responses',
  model:
    process.env.CUMT_PROVIDER_MODEL ||
    process.env.CUMT_CODE_MODEL ||
    process.env.YLSCODE_MODEL ||
    'gpt-5.4',
  compatModel:
    process.env.CUMT_COMPAT_MODEL ||
    process.env.CUMT_CODE_COMPAT_MODEL ||
    process.env.CUMT_CODE_CLAUDE_MODEL ||
    process.env.KUANGBING_CLAUDE_MODEL ||
    process.env.CUMT_PROVIDER_MODEL ||
    process.env.CUMT_CODE_MODEL ||
    process.env.YLSCODE_MODEL ||
    'gpt-5.4',
  reasoningEffort:
    process.env.CUMT_REASONING_EFFORT ||
    process.env.CUMT_CODE_REASONING_EFFORT ||
    process.env.YLSCODE_REASONING_EFFORT ||
    'high',
  textVerbosity:
    process.env.CUMT_TEXT_VERBOSITY ||
    process.env.CUMT_CODE_TEXT_VERBOSITY ||
    process.env.YLSCODE_TEXT_VERBOSITY ||
    'low',
  serviceTier:
    process.env.CUMT_SERVICE_TIER ||
    process.env.CUMT_CODE_SERVICE_TIER ||
    process.env.YLSCODE_SERVICE_TIER ||
    'fast',
  envKey:
    process.env.CUMT_ENV_KEY ||
    process.env.CUMT_CODE_ENV_KEY ||
    'OPENAI_API_KEY',
});
const PROVIDER_PRESETS = Object.freeze([
  {
    id: 'default',
    label: '默认兼容网关',
    description: '适配当前默认的 Responses 兼容上游。',
    values: {
      provider: 'default',
      baseUrl: 'https://code.ylsagi.com/codex',
      wireApi: 'responses',
      model: 'gpt-5.4',
      compatModel: 'gpt-5.4',
      reasoningEffort: 'high',
      textVerbosity: 'low',
      serviceTier: 'fast',
      envKey: 'OPENAI_API_KEY',
    },
  },
  {
    id: 'openai',
    label: 'OpenAI / Codex API',
    description: '使用官方 OpenAI Responses API 作为上游。',
    values: {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      wireApi: 'responses',
      model: 'gpt-5.4',
      compatModel: 'gpt-5.4',
      reasoningEffort: 'high',
      textVerbosity: 'low',
      serviceTier: '',
      envKey: 'OPENAI_API_KEY',
    },
  },
  {
    id: 'volcengine',
    label: '方舟 Coding Plan',
    description: '使用方舟 Coding Plan 的 Anthropic 兼容接口。',
    values: {
      provider: 'volcengine',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
      wireApi: 'anthropic_messages',
      model: 'ark-code-latest',
      compatModel: 'ark-code-latest',
      reasoningEffort: 'high',
      textVerbosity: 'low',
      serviceTier: '',
      envKey: 'ARK_API_KEY',
    },
  },
  {
    id: 'glm',
    label: 'GLM',
    description: '使用智谱 GLM Coding Plan 的 Anthropic 兼容接口。',
    values: {
      provider: 'glm',
      baseUrl: 'https://open.bigmodel.cn/api/anthropic',
      wireApi: 'anthropic_messages',
      model: 'glm-4.7',
      compatModel: 'glm-4.7',
      reasoningEffort: 'high',
      textVerbosity: 'low',
      serviceTier: '',
      envKey: 'GLM_API_KEY',
    },
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    description: '使用 MiniMax Anthropic 兼容接口。',
    values: {
      provider: 'minimax',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      wireApi: 'anthropic_messages',
      model: 'MiniMax-M2.5',
      compatModel: 'MiniMax-M2.5',
      reasoningEffort: 'high',
      textVerbosity: 'low',
      serviceTier: '',
      envKey: 'MINIMAX_API_KEY',
    },
  },
  {
    id: 'kimi',
    label: 'Kimi',
    description: '使用 Kimi 编程模型的 Anthropic 兼容接口。',
    values: {
      provider: 'kimi',
      baseUrl: 'https://api.moonshot.ai/anthropic',
      wireApi: 'anthropic_messages',
      model: 'kimi-k2.5',
      compatModel: 'kimi-k2.5',
      reasoningEffort: 'high',
      textVerbosity: 'low',
      serviceTier: '',
      envKey: 'MOONSHOT_API_KEY',
    },
  },
  {
    id: 'custom',
    label: '自定义上游',
    description: '手动配置 Base URL、协议和模型。',
    values: {
      provider: 'custom',
      baseUrl: 'https://api.openai.com/v1',
      wireApi: 'responses',
      model: 'gpt-5.4',
      compatModel: 'gpt-5.4',
      reasoningEffort: 'high',
      textVerbosity: 'low',
      serviceTier: '',
      envKey: 'OPENAI_API_KEY',
    },
  },
]);
let runtimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
let runtimeConfigLoaded = false;
let runtimeProfiles = {
  default: { ...DEFAULT_RUNTIME_CONFIG },
};
let runtimeActiveProfile = 'default';
const DEFAULT_COMPANY_ANNOUNCEMENT =
  process.env.CUMT_CODE_COMPANY_ANNOUNCEMENT ||
  `${ANSI_KUANGDA_BLUE}▌${ANSI_RESET} ${BRAND_SLOGAN} ${ANSI_KUANGDA_BLUE}▐${ANSI_RESET}`;
const DEFAULT_RUNTIME_BRAND_REPLACEMENTS = [
  ['Welcome to Claude Code', 'Welcome to CUMT Code'],
  ['Claude Code', 'CUMT Code'],
  [
    'Ask Claude to create a new app or clone a repository',
    DEFAULT_WELCOME_PROMPT,
  ],
  [
    '◉ 中国矿业大学 · CUMT · 1909 ◉\\nUse CUMT Coder to scaffold a new project or clone a repository',
    DEFAULT_WELCOME_PROMPT,
  ],
  [
    'Ask CUMT Coder to scaffold a new project or clone a repository',
    DEFAULT_WELCOME_PROMPT,
  ],
  [
    'Run /init to create a CLAUDE.md file with instructions for Claude',
    `Run /init to create a repo guide for ${AGENT_NAME}`,
  ],
  [
    'Opus now defaults to 1M context · 5x more room, same pricing',
    BRAND_SLOGAN,
  ],
  [
    'ylscode · gpt-5.4 · high reasoning ready',
    BRAND_SLOGAN,
  ],
  [
    '崇德尚学 · 自主研发 · 遥遥领先',
    BRAND_SLOGAN,
  ],
  [
    '崇德尚学，自主研发，遥遥领先',
    BRAND_SLOGAN,
  ],
  ['Tips for getting started', 'Quick Start'],
  [
    'Note: You have launched claude in your home directory. For the best experience, launch it in a project directory instead.',
    'Note: You launched CUMT Code in your home directory. For the best experience, open a project directory first.',
  ],
  [
    'Tip: You can launch CUMT Code with just `claude`',
    'Tip: You can launch CUMT Code with just `cumt`',
  ],
  ['claude --resume', 'cumt --resume'],
  ['claude --continue', 'cumt --continue'],
  [
    'Model for the current session. Provide an alias for the latest model (e.g. \'sonnet\' or \'opus\') or a model\'s full name (e.g. \'claude-sonnet-4-6\').',
    'Model for the current session. Use the current profile model name, for example \'gpt-5.4\'.',
  ],
  [
    'Model for the current session. Use the configured ylscode model name, for example \'gpt-5.4\'.',
    'Model for the current session. Use the current profile model name, for example \'gpt-5.4\'.',
  ],
  [
    'Note: The workspace trust dialog is skipped when Claude is run with the -p mode. Only use this flag in directories you trust.',
    'Note: The workspace trust dialog is skipped when CUMT Code is run with the -p mode. Only use this flag in directories you trust.',
  ],
  [
    'Sets CLAUDE_CODE_SIMPLE=1.',
    'Enables simplified runtime mode.',
  ],
  [
    'Remote plan mode with our most powerful model (Opus).',
    'Remote plan mode with the current profile model.',
  ],
  [
    'Remote plan mode with the configured ylscode model.',
    'Remote plan mode with the current profile model.',
  ],
  [
    'Advanced multi-agent plan mode with our most powerful model',
    'Advanced multi-agent plan mode with the current profile model',
  ],
  [
    'Advanced multi-agent plan mode with the configured ylscode model',
    'Advanced multi-agent plan mode with the current profile model',
  ],
  [
    '(Opus). Runs in CUMT Code on the web. When the plan is ready,',
    'Runs in CUMT Code on the web. When the plan is ready,',
  ],
  [
    'Channels require claude.ai authentication · run /login, then restart',
    'Channels require account auth · run /login, then restart',
  ],
  ['API Usage Billing', 'Provider Billing'],
  ['CLAUDE.md auto-discovery', 'repo-guide auto-discovery'],
  ['CLAUDE.md dirs', 'guide dirs'],
  ['no CLAUDE.md files', 'no repo guide files'],
  ['CLAUDE.md may be stale', 'repo guide may be stale'],
  [
    'U0Y={default:{r1L:" ▐",r1E:"▛███▜",r1R:"▌",r2L:"▝▜",r2R:"▛▘"},"look-left":{r1L:" ▐",r1E:"▟███▟",r1R:"▌",r2L:"▝▜",r2R:"▛▘"},"look-right":{r1L:" ▐",r1E:"▙███▙",r1R:"▌",r2L:"▝▜",r2R:"▛▘"},"arms-up":{r1L:"▗▟",r1E:"▛███▜",r1R:"▙▖",r2L:" ▜",r2R:"▛ "}}',
    'U0Y={default:{r1L:" ╭",r1E:"▟█◉█▙",r1R:"╮",r2L:"╱▌",r2R:"▐╲"},"look-left":{r1L:" ╭",r1E:"▟◉██▙",r1R:"╮",r2L:"╱▌",r2R:"▐╲"},"look-right":{r1L:" ╭",r1E:"▟██◉▙",r1R:"╮",r2L:"╱▌",r2R:"▐╲"},"arms-up":{r1L:"╱╭",r1E:"▟█◉█▙",r1R:"╮╲",r2L:" ╲",r2R:"╱ "}}',
  ],
  [
    'U0Y={default:{r1L:" ╭",r1E:"▛█◉█▜",r1R:"╮",r2L:"╱▌",r2R:"▐╲"},"look-left":{r1L:" ╭",r1E:"▛◉██▜",r1R:"╮",r2L:"╱▌",r2R:"▐╲"},"look-right":{r1L:" ╭",r1E:"▛██◉▜",r1R:"╮",r2L:"╱▌",r2R:"▐╲"},"arms-up":{r1L:"╱╭",r1E:"▛█◉█▜",r1R:"╮╲",r2L:" ╲",r2R:"╱ "}}',
    'U0Y={default:{r1L:" ╭",r1E:"▟█◉█▙",r1R:"╮",r2L:"╱▌",r2R:"▐╲"},"look-left":{r1L:" ╭",r1E:"▟◉██▙",r1R:"╮",r2L:"╱▌",r2R:"▐╲"},"look-right":{r1L:" ╭",r1E:"▟██◉▙",r1R:"╮",r2L:"╱▌",r2R:"▐╲"},"arms-up":{r1L:"╱╭",r1E:"▟█◉█▙",r1R:"╮╲",r2L:" ╲",r2R:"╱ "}}',
  ],
  [
    'Q0Y={default:" ▗   ▖ ","look-left":" ▘   ▘ ","look-right":" ▝   ▝ ","arms-up":" ▗   ▖ "}',
    'Q0Y={default:" ▄█◉█▄ ","look-left":" ▄◉██▄ ","look-right":" ▄██◉▄ ","arms-up":" ▄█◉█▄ "}',
  ],
  [
    'Q0Y={default:" ▗█◉█▖ ","look-left":" ▗◉██▖ ","look-right":" ▗██◉▖ ","arms-up":" ▗█◉█▖ "}',
    'Q0Y={default:" ▄█◉█▄ ","look-left":" ▄◉██▄ ","look-right":" ▄██◉▄ ","arms-up":" ▄█◉█▄ "}',
  ],
  [
    'uz.createElement(T,{color:"clawd_body",backgroundColor:"clawd_background"},"█████")',
    'uz.createElement(T,{color:"clawd_body",backgroundColor:"clawd_background"},"▙█▄█▟")',
  ],
  [
    'uz.createElement(T,{color:"clawd_body",backgroundColor:"clawd_background"},"█▄█▄█")',
    'uz.createElement(T,{color:"clawd_body",backgroundColor:"clawd_background"},"▙█▄█▟")',
  ],
  [
    'uz.createElement(T,{color:"clawd_body"},"  ","▘▘ ▝▝","  ")',
    'uz.createElement(T,{color:"clawd_body"},"  ","╱▅ ▅╲","  ")',
  ],
  [
    'uz.createElement(T,{color:"clawd_body"},"  ","╱╵ ╵╲","  ")',
    'uz.createElement(T,{color:"clawd_body"},"  ","╱▅ ▅╲","  ")',
  ],
  [
    'w=uz.createElement(T,{backgroundColor:"clawd_body"}," ".repeat(7)),j=uz.createElement(T,{color:"clawd_body"},"▘▘ ▝▝")',
    'w=uz.createElement(T,{backgroundColor:"clawd_body"}," ".repeat(7)),j=uz.createElement(T,{color:"clawd_body"},"╱▅ ▅╲")',
  ],
  [
    'w=uz.createElement(T,{backgroundColor:"clawd_body"}," ".repeat(7)),j=uz.createElement(T,{color:"clawd_body"},"╱╵ ╵╲")',
    'w=uz.createElement(T,{backgroundColor:"clawd_body"}," ".repeat(7)),j=uz.createElement(T,{color:"clawd_body"},"╱▅ ▅╲")',
  ],
  ['claude:"rgb(215,119,87)"', 'claude:"rgb(30,50,100)"'],
  ['claude:"rgb(255,153,51)"', 'claude:"rgb(30,50,100)"'],
  ['claudeShimmer:"rgb(245,149,117)"', 'claudeShimmer:"rgb(82,132,204)"'],
  ['claudeShimmer:"rgb(235,159,127)"', 'claudeShimmer:"rgb(82,132,204)"'],
  ['claudeShimmer:"rgb(255,183,101)"', 'claudeShimmer:"rgb(82,132,204)"'],
  ['professionalBlue:"rgb(106,155,204)"', 'professionalBlue:"rgb(82,132,204)"'],
  ['clawd_body:"rgb(215,119,87)"', 'clawd_body:"rgb(82,132,204)"'],
  ['clawd_background:"rgb(0,0,0)"', 'clawd_background:"rgb(15,33,71)"'],
  ['briefLabelClaude:"rgb(215,119,87)"', 'briefLabelClaude:"rgb(82,132,204)"'],
  ['briefLabelClaude:"rgb(255,153,51)"', 'briefLabelClaude:"rgb(82,132,204)"'],
  ['claude:"ansi:redBright"', 'claude:"ansi:blueBright"'],
  ['claudeShimmer:"ansi:yellowBright"', 'claudeShimmer:"ansi:blueBright"'],
  ['clawd_body:"ansi:redBright"', 'clawd_body:"ansi:blueBright"'],
  ['briefLabelClaude:"ansi:redBright"', 'briefLabelClaude:"ansi:blueBright"'],
  [
    'GF8="On us. Works on third-party apps · /extra-usage"',
    `GF8="${BRAND_SLOGAN}"`,
  ],
  [
    'GF8="中国矿业大学 · CUMT · 1909 · 崇德尚学，自主研发，遥遥领先"',
    `GF8="${BRAND_SLOGAN}"`,
  ],
  [
    'GF8="崇德尚学，自主研发，遥遥领先"',
    `GF8="${BRAND_SLOGAN}"`,
  ],
  ['name("claude")', 'name("cumt")'],
  ['process.title="claude"', 'process.title="CUMT Code"'],
  ['Enable Claude in Chrome integration', 'Enable CUMT Code in Chrome integration'],
  ['Disable Claude in Chrome integration', 'Disable CUMT Code in Chrome integration'],
  ['Sign in to your Anthropic account', 'Sign in to your configured account'],
  ['Log out from your Anthropic account', 'Log out from your configured account'],
  [
    'Successfully logged out from your Anthropic account.',
    'Successfully logged out from your configured account.',
  ],
  [
    'Use Anthropic Console (API usage billing) instead of Claude subscription',
    'Use provider billing login instead of subscription login',
  ],
  ['Use Claude subscription (default)', 'Use subscription login (default)'],
  [
    'Set up a long-lived authentication token (requires Claude subscription)',
    'Set up a long-lived authentication token',
  ],
  [
    'Import MCP servers from Claude Desktop (Mac and WSL only)',
    'Import MCP servers from desktop config (Mac and WSL only)',
  ],
  ['claude /logout', 'cumt /logout'],
  [
    'Connect your local environment for remote-control sessions via claude.ai/code',
    'Connect your local environment for remote-control sessions via CUMT Code',
  ],
];

const ADAPTER_INSTRUCTIONS = [
  'You are running inside CUMT Code through a compatibility adapter layer.',
  'The request body below is a transcript reconstructed from prior turns.',
  'Transcript markers:',
  '- SYSTEM / DEVELOPER: instruction text from the client.',
  '- USER / ASSISTANT: plain conversation text.',
  '- ASSISTANT_TOOL_USE: a prior tool call with id, name, and input JSON.',
  '- USER_TOOL_RESULT: the result returned for a prior tool call.',
  'When you need a tool, emit a function call only.',
  'Treat USER_TOOL_RESULT blocks as authoritative tool outputs.',
  'When describing your runtime or identity to the user, say CUMT Code.',
  'When users ask about runtime identity, describe it as CUMT Code.',
].join('\n');

function normalizeRuntimeConfig(rawConfig = {}) {
  return {
    provider:
      typeof rawConfig.provider === 'string' && rawConfig.provider.trim().length > 0
        ? rawConfig.provider.trim()
        : DEFAULT_RUNTIME_CONFIG.provider,
    baseUrl:
      typeof rawConfig.baseUrl === 'string' && rawConfig.baseUrl.trim().length > 0
        ? rawConfig.baseUrl.trim()
        : DEFAULT_RUNTIME_CONFIG.baseUrl,
    wireApi:
      typeof rawConfig.wireApi === 'string' && rawConfig.wireApi.trim().length > 0
        ? rawConfig.wireApi.trim()
        : DEFAULT_RUNTIME_CONFIG.wireApi,
    model:
      typeof rawConfig.model === 'string' && rawConfig.model.trim().length > 0
        ? rawConfig.model.trim()
        : DEFAULT_RUNTIME_CONFIG.model,
    compatModel:
      typeof rawConfig.compatModel === 'string' &&
      rawConfig.compatModel.trim().length > 0
        ? rawConfig.compatModel.trim()
        : typeof rawConfig.cumtCompatModel === 'string' &&
            rawConfig.cumtCompatModel.trim().length > 0
          ? rawConfig.cumtCompatModel.trim()
        : typeof rawConfig.claudeCompatModel === 'string' &&
            rawConfig.claudeCompatModel.trim().length > 0
          ? rawConfig.claudeCompatModel.trim()
          : typeof rawConfig.model === 'string' && rawConfig.model.trim().length > 0
            ? rawConfig.model.trim()
            : DEFAULT_RUNTIME_CONFIG.compatModel,
    reasoningEffort:
      typeof rawConfig.reasoningEffort === 'string' &&
      rawConfig.reasoningEffort.trim().length > 0
        ? rawConfig.reasoningEffort.trim()
        : DEFAULT_RUNTIME_CONFIG.reasoningEffort,
    textVerbosity:
      typeof rawConfig.textVerbosity === 'string' &&
      rawConfig.textVerbosity.trim().length > 0
        ? rawConfig.textVerbosity.trim()
        : DEFAULT_RUNTIME_CONFIG.textVerbosity,
    serviceTier:
      typeof rawConfig.serviceTier === 'string'
        ? rawConfig.serviceTier.trim()
        : DEFAULT_RUNTIME_CONFIG.serviceTier,
    envKey:
      typeof rawConfig.envKey === 'string' && rawConfig.envKey.trim().length > 0
        ? rawConfig.envKey.trim()
        : DEFAULT_RUNTIME_CONFIG.envKey,
  };
}

function normalizeProfileName(profileName) {
  if (typeof profileName !== 'string') {
    return 'default';
  }
  const normalized = profileName.trim().toLowerCase();
  if (!normalized) {
    return 'default';
  }
  return normalized.replace(/[^a-z0-9_-]+/g, '-');
}

function normalizeRuntimeStore(rawStore = {}) {
  if (rawStore && rawStore.profiles && typeof rawStore.profiles === 'object') {
    const normalizedProfiles = Object.fromEntries(
      Object.entries(rawStore.profiles)
        .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
        .map(([profileName, value]) => [
          normalizeProfileName(profileName),
          normalizeRuntimeConfig(value),
        ]),
    );

    if (Object.keys(normalizedProfiles).length === 0) {
      normalizedProfiles.default = { ...DEFAULT_RUNTIME_CONFIG };
    }

    const activeProfile = normalizedProfiles[normalizeProfileName(rawStore.activeProfile)]
      ? normalizeProfileName(rawStore.activeProfile)
      : Object.keys(normalizedProfiles)[0];

    return {
      activeProfile,
      profiles: normalizedProfiles,
    };
  }

  return {
    activeProfile: 'default',
    profiles: {
      default: normalizeRuntimeConfig(rawStore),
    },
  };
}

function getRuntimeConfig() {
  return runtimeConfig;
}

function getRuntimeProfileName() {
  return runtimeActiveProfile;
}

function getRuntimeProfiles() {
  return runtimeProfiles;
}

async function loadRuntimeConfigIfNeeded() {
  if (runtimeConfigLoaded) {
    return runtimeConfig;
  }

  await migrateLegacyCumtHomeIfNeeded();
  const rawStore =
    (await readJsonFileIfExists(CUMT_CONFIG_FILE)) ||
    (await readJsonFileIfExists(LEGACY_CUMT_CONFIG_FILE)) ||
    {};
  const normalizedStore = normalizeRuntimeStore(rawStore);
  runtimeProfiles = normalizedStore.profiles;
  runtimeActiveProfile = normalizedStore.activeProfile;
  runtimeConfig = {
    ...DEFAULT_RUNTIME_CONFIG,
    ...runtimeProfiles[runtimeActiveProfile],
  };
  runtimeConfigLoaded = true;
  return runtimeConfig;
}

function resetRuntimeConfigCache() {
  runtimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
  runtimeProfiles = {
    default: { ...DEFAULT_RUNTIME_CONFIG },
  };
  runtimeActiveProfile = 'default';
  runtimeConfigLoaded = false;
}

async function refreshRuntimeConfig() {
  resetRuntimeConfigCache();
  return loadRuntimeConfigIfNeeded();
}

async function migrateLegacyCumtHomeIfNeeded() {
  await mkdir(CUMT_CONFIG_HOME, { recursive: true });

  if (!existsSync(CUMT_CONFIG_FILE) && existsSync(LEGACY_CUMT_CONFIG_FILE)) {
    await cp(LEGACY_CUMT_CONFIG_FILE, CUMT_CONFIG_FILE);
  }
  if (!existsSync(CUMT_AUTH_FILE) && existsSync(LEGACY_CUMT_AUTH_FILE)) {
    await cp(LEGACY_CUMT_AUTH_FILE, CUMT_AUTH_FILE);
  }
}

async function initializeRuntimeHome(force = false) {
  const sourceDir = join(homedir(), '.claude');
  const sourceGlobalFile = join(homedir(), '.claude.json');
  const targetDir = CUMT_RUNTIME_CONFIG_DIR;
  const targetGlobalFile = getManagedGlobalConfigFile();

  await mkdir(CUMT_CONFIG_HOME, { recursive: true });

  if (existsSync(sourceDir) && (force || !existsSync(targetDir))) {
    await cp(sourceDir, targetDir, {
      recursive: true,
      force,
      errorOnExist: false,
    });
  } else {
    await mkdir(targetDir, { recursive: true });
  }

  if (existsSync(sourceGlobalFile) && (force || !existsSync(targetGlobalFile))) {
    await cp(sourceGlobalFile, targetGlobalFile, { force });
  }
  if (!existsSync(targetGlobalFile)) {
    await writeSecureJsonFile(targetGlobalFile, {
      hasCompletedOnboarding: true,
    });
  }
}

function getPresetSummaries() {
  return PROVIDER_PRESETS.map(preset => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    wireApi: preset.values.wireApi,
    baseUrl: preset.values.baseUrl,
    model: preset.values.model,
    envKey: preset.values.envKey,
  }));
}

async function cleanupLegacySlashCommands() {
  const commandsDir = join(CUMT_RUNTIME_CONFIG_DIR, 'commands');
  await mkdir(commandsDir, { recursive: true });
  await Promise.all(
    MANAGED_LEGACY_COMMAND_FILES.map(async commandFileName => {
      try {
        await rm(join(commandsDir, commandFileName));
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }),
  );
}

function resolveRequestedModel(requestedModel, fallbackModel = getRuntimeConfig().model) {
  if (typeof requestedModel === 'string' && requestedModel.trim().length > 0) {
    return requestedModel.trim();
  }
  return fallbackModel;
}

function resolveAnthropicUpstreamModel(_requestedModel) {
  return getRuntimeConfig().model;
}

function applyOpenAIDefaults(upstreamBody, { defaultStream = false } = {}) {
  const config = getRuntimeConfig();
  const nextBody = {
    ...upstreamBody,
    model: resolveRequestedModel(upstreamBody.model, config.model),
  };

  if (typeof nextBody.stream !== 'boolean') {
    nextBody.stream = defaultStream;
  }
  if (typeof nextBody.store !== 'boolean') {
    nextBody.store = false;
  }
  if (!('parallel_tool_calls' in nextBody)) {
    nextBody.parallel_tool_calls = true;
  }
  if (!('service_tier' in nextBody) && config.serviceTier) {
    nextBody.service_tier = config.serviceTier;
  }
  if (
    !('reasoning' in nextBody) &&
    typeof config.reasoningEffort === 'string' &&
    config.reasoningEffort &&
    config.reasoningEffort !== 'none'
  ) {
    nextBody.reasoning = {
      effort: config.reasoningEffort,
      summary: null,
    };
  }
  if (
    !('text' in nextBody) &&
    typeof config.textVerbosity === 'string' &&
    config.textVerbosity
  ) {
    nextBody.text = {
      verbosity: config.textVerbosity,
    };
  }

  return nextBody;
}

function getCurrentPresetById(presetId) {
  return PROVIDER_PRESETS.find(preset => preset.id === presetId) || null;
}

async function writeSecureJsonFile(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function saveRuntimeStore(nextStore) {
  const normalizedStore = normalizeRuntimeStore(nextStore);
  await writeSecureJsonFile(CUMT_CONFIG_FILE, normalizedStore);
  runtimeProfiles = normalizedStore.profiles;
  runtimeActiveProfile = normalizedStore.activeProfile;
  runtimeConfig = {
    ...DEFAULT_RUNTIME_CONFIG,
    ...runtimeProfiles[runtimeActiveProfile],
  };
  runtimeConfigLoaded = true;
  return normalizedStore;
}

async function saveRuntimeConfig(nextConfig, profileName = getRuntimeProfileName()) {
  await loadRuntimeConfigIfNeeded();
  const normalizedProfileName = normalizeProfileName(profileName);
  const currentStore = normalizeRuntimeStore(
    (await readJsonFileIfExists(CUMT_CONFIG_FILE)) || {
      activeProfile: getRuntimeProfileName(),
      profiles: getRuntimeProfiles(),
    },
  );
  const nextStore = {
    activeProfile: normalizedProfileName,
    profiles: {
      ...currentStore.profiles,
      [normalizedProfileName]: normalizeRuntimeConfig(nextConfig),
    },
  };
  await saveRuntimeStore(nextStore);
  return nextStore.profiles[normalizedProfileName];
}

async function setActiveRuntimeProfile(profileName) {
  await loadRuntimeConfigIfNeeded();
  const normalizedProfileName = normalizeProfileName(profileName);
  const currentStore = normalizeRuntimeStore(
    (await readJsonFileIfExists(CUMT_CONFIG_FILE)) || {
      activeProfile: getRuntimeProfileName(),
      profiles: getRuntimeProfiles(),
    },
  );
  if (!currentStore.profiles[normalizedProfileName]) {
    throw new Error(`Profile not found: ${normalizedProfileName}`);
  }
  await saveRuntimeStore({
    activeProfile: normalizedProfileName,
    profiles: currentStore.profiles,
  });
  return normalizedProfileName;
}

async function deleteRuntimeProfile(profileName) {
  await loadRuntimeConfigIfNeeded();
  const normalizedProfileName = normalizeProfileName(profileName);
  const currentStore = normalizeRuntimeStore(
    (await readJsonFileIfExists(CUMT_CONFIG_FILE)) || {
      activeProfile: getRuntimeProfileName(),
      profiles: getRuntimeProfiles(),
    },
  );
  const currentProfiles = { ...currentStore.profiles };
  const profileNames = Object.keys(currentProfiles);

  if (!currentProfiles[normalizedProfileName]) {
    throw new Error(`Profile not found: ${normalizedProfileName}`);
  }
  if (profileNames.length === 1) {
    throw new Error('At least one profile must remain.');
  }

  delete currentProfiles[normalizedProfileName];
  const nextActiveProfile =
    normalizedProfileName === currentStore.activeProfile
      ? Object.keys(currentProfiles)[0]
      : currentStore.activeProfile;
  await saveRuntimeStore({
    activeProfile: nextActiveProfile,
    profiles: currentProfiles,
  });
}

async function loadRuntimeAuthStore() {
  await migrateLegacyCumtHomeIfNeeded();
  const rawAuth =
    (await readJsonFileIfExists(CUMT_AUTH_FILE)) ||
    (await readJsonFileIfExists(LEGACY_CUMT_AUTH_FILE)) ||
    {};

  if (rawAuth && rawAuth.profiles && typeof rawAuth.profiles === 'object') {
    return {
      profiles: rawAuth.profiles,
    };
  }

  return {
    profiles: {
      default: rawAuth,
    },
  };
}

async function saveRuntimeAuth(profileName, envKey, apiKey) {
  const normalizedProfileName = normalizeProfileName(profileName);
  const currentAuthStore = await loadRuntimeAuthStore();
  const nextAuth = {
    profiles: {
      ...currentAuthStore.profiles,
      [normalizedProfileName]: {
        ...(currentAuthStore.profiles[normalizedProfileName] || {}),
        [envKey]: apiKey,
      },
    },
  };
  await writeSecureJsonFile(CUMT_AUTH_FILE, nextAuth);
  return nextAuth;
}

async function clearRuntimeAuth(profileName = null) {
  if (!profileName) {
    try {
      await rm(CUMT_AUTH_FILE, { force: true });
    } catch {}
    return;
  }

  const normalizedProfileName = normalizeProfileName(profileName);
  const currentAuthStore = await loadRuntimeAuthStore();
  if (!currentAuthStore.profiles[normalizedProfileName]) {
    return;
  }
  delete currentAuthStore.profiles[normalizedProfileName];
  await writeSecureJsonFile(CUMT_AUTH_FILE, currentAuthStore);
}

function sanitizeConfigForDisplay(config) {
  return {
    activeProfile: getRuntimeProfileName(),
    profiles: Object.keys(getRuntimeProfiles()),
    provider: config.provider,
    baseUrl: config.baseUrl,
    wireApi: config.wireApi,
    model: config.model,
    compatModel: config.compatModel,
    reasoningEffort: config.reasoningEffort,
    textVerbosity: config.textVerbosity,
    serviceTier: config.serviceTier || '(none)',
    envKey: config.envKey,
    cumtHome: CUMT_CONFIG_HOME,
    runtimeConfigDir: CUMT_RUNTIME_CONFIG_DIR,
    configFile: CUMT_CONFIG_FILE,
    authFile: CUMT_AUTH_FILE,
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function createPromptSession() {
  return createInterface({
    input,
    output,
    terminal: Boolean(input.isTTY && output.isTTY),
  });
}

function colorTitle(text) {
  return colorize(`${ANSI_BOLD}${text}${ANSI_RESET}`, ANSI_KUANGDA_BLUE);
}

async function promptText(rl, label, fallback = '') {
  const suffix = fallback ? ` [${fallback}]` : '';
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || fallback;
}

async function promptChoice(rl, title, options) {
  process.stdout.write(`${colorTitle(title)}\n`);
  options.forEach((option, index) => {
    process.stdout.write(
      `  ${index + 1}. ${option.label}  ${ANSI_DIM}${option.description}${ANSI_RESET}\n`,
    );
  });

  while (true) {
    const answer = (await rl.question('请选择编号: ')).trim();
    const numeric = Number(answer);
    if (
      Number.isInteger(numeric) &&
      numeric >= 1 &&
      numeric <= options.length
    ) {
      return options[numeric - 1];
    }
    process.stdout.write('输入无效，请重新输入。\n');
  }
}

async function testResponsesConnection(config, apiKey) {
  if (config.wireApi === 'anthropic_messages') {
    const response = await createAnthropicUpstreamRequest(
      apiKey,
      {
        model: config.model,
        max_tokens: 32,
        stream: false,
        messages: [
          {
            role: 'user',
            content: 'Reply with OK only.',
          },
        ],
      },
      false,
    );
    const body = await readUpstreamJsonResponse(response);
    return {
      responseId: body.id || null,
      model: body.model || config.model,
      text: extractAnthropicText(body.content),
    };
  }

  const testBody = {
    model: config.model,
    input: 'Reply with OK only.',
    stream: false,
    store: false,
  };

  if (config.serviceTier) {
    testBody.service_tier = config.serviceTier;
  }
  if (config.reasoningEffort && config.reasoningEffort !== 'none') {
    testBody.reasoning = {
      effort: config.reasoningEffort,
      summary: null,
    };
  }
  if (config.textVerbosity) {
    testBody.text = {
      verbosity: config.textVerbosity,
    };
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: buildUpstreamHeaders(apiKey),
    body: JSON.stringify(testBody),
  });

  if (!response.ok) {
    throw new Error(`upstream ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();
  const text = extractTextFromResponseOutput(body.output);

  return {
    responseId: body.id || null,
    model: body.model || config.model,
    text,
  };
}

async function runConnectivityTest(profileName = getRuntimeProfileName()) {
  await loadRuntimeConfigIfNeeded();
  const normalizedProfileName = normalizeProfileName(profileName);
  const config = getRuntimeProfiles()[normalizedProfileName] || getRuntimeConfig();
  const apiKey = await resolveApiKey(normalizedProfileName);
  if (!apiKey) {
    throw new Error(
      `Missing ${config.envKey}. Run \`cumt config\` first or export the environment variable.`,
    );
  }

  if (!['responses', 'anthropic_messages'].includes(config.wireApi)) {
    throw new Error(
      `Unsupported wireApi: ${config.wireApi}. Current wizard supports responses and anthropic_messages.`,
    );
  }

  return testResponsesConnection(config, apiKey);
}

async function promptProfileName(rl, label, fallback = 'default') {
  while (true) {
    const rawName = await promptText(rl, label, fallback);
    const normalizedProfileName = normalizeProfileName(rawName);
    if (normalizedProfileName) {
      return normalizedProfileName;
    }
    process.stdout.write('配置名不能为空。\n');
  }
}

function renderConfigSummary(profileName, config) {
  return {
    profile: profileName,
    ...sanitizeConfigForDisplay(config),
  };
}

async function editProfileInteractively(rl, profileName, currentConfig) {
  const preset = await promptChoice(
    rl,
    '选择上游提供方',
    PROVIDER_PRESETS.map(item => ({
      label: item.label,
      description: item.description,
      value: item,
    })),
  );
  const presetConfig = { ...preset.value.values };

  const baseUrl =
    preset.value.id === 'custom'
      ? await promptText(rl, 'Base URL', currentConfig.baseUrl || presetConfig.baseUrl)
      : presetConfig.baseUrl;
  const wireApi =
    preset.value.id === 'custom'
      ? (
          await promptChoice(rl, '选择上游协议', [
            {
              label: 'responses',
              description: 'OpenAI Responses 兼容上游',
              value: 'responses',
            },
            {
              label: 'anthropic_messages',
              description: 'Anthropic Messages 兼容上游',
              value: 'anthropic_messages',
            },
          ])
        ).value
      : presetConfig.wireApi;
  const model = await promptText(
    rl,
    '模型名称',
    currentConfig.model || presetConfig.model,
  );
  const compatModel = await promptText(
    rl,
    '兼容层模型名',
    currentConfig.compatModel || model,
  );
  const envKey = await promptText(
    rl,
    '认证环境变量名',
    currentConfig.envKey || presetConfig.envKey,
  );
  const serviceTier = await promptText(
    rl,
    'service_tier',
    currentConfig.serviceTier || presetConfig.serviceTier || '',
  );
  const reasoningEffort = await promptText(
    rl,
    'reasoning_effort',
    currentConfig.reasoningEffort || presetConfig.reasoningEffort,
  );
  const textVerbosity = await promptText(
    rl,
    'text.verbosity',
    currentConfig.textVerbosity || presetConfig.textVerbosity,
  );
  const apiKey = await promptText(
    rl,
    `输入 ${envKey}（直接回车则不改动 ${profileName} 已保存密钥）`,
    '',
  );

  const nextConfig = await saveRuntimeConfig(
    {
      ...presetConfig,
      baseUrl,
      wireApi,
      model,
      compatModel,
      envKey,
      serviceTier,
      reasoningEffort,
      textVerbosity,
    },
    profileName,
  );

  if (apiKey) {
    await saveRuntimeAuth(profileName, envKey, apiKey);
  }

  return nextConfig;
}

async function applyPresetToProfile(
  presetId,
  profileName = getRuntimeProfileName(),
) {
  await loadRuntimeConfigIfNeeded();
  const preset = getCurrentPresetById(presetId);
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`);
  }
  const normalizedProfileName = normalizeProfileName(profileName);
  const currentConfig =
    getRuntimeProfiles()[normalizedProfileName] || { ...DEFAULT_RUNTIME_CONFIG };

  return saveRuntimeConfig(
    {
      ...currentConfig,
      ...preset.values,
    },
    normalizedProfileName,
  );
}

async function updateProfileModel(
  model,
  profileName = getRuntimeProfileName(),
) {
  await loadRuntimeConfigIfNeeded();
  const normalizedProfileName = normalizeProfileName(profileName);
  const currentConfig =
    getRuntimeProfiles()[normalizedProfileName] || getRuntimeConfig();
  return saveRuntimeConfig(
    {
      ...currentConfig,
      model,
      compatModel: model,
    },
    normalizedProfileName,
  );
}

async function runConfigWizard() {
  await loadRuntimeConfigIfNeeded();
  const rl = await createPromptSession();

  try {
    process.stdout.write(`${colorTitle('CUMT Code Config')}\n`);
    process.stdout.write(
      `${ANSI_DIM}配置写入 ${CUMT_CONFIG_FILE}，密钥写入 ${CUMT_AUTH_FILE}，运行环境隔离在 ${CUMT_RUNTIME_CONFIG_DIR}。${ANSI_RESET}\n\n`,
    );

    while (true) {
      const activeProfile = getRuntimeProfileName();
      const activeConfig = getRuntimeConfig();
      const action = await promptChoice(rl, `当前配置: ${activeProfile}`, [
        {
          label: '编辑当前配置',
          description: '修改当前激活的 profile',
          value: 'edit',
        },
        {
          label: '新建配置',
          description: '创建一套新的 profile 并切换过去',
          value: 'create',
        },
        {
          label: '切换配置',
          description: '切换当前激活的 profile',
          value: 'switch',
        },
        {
          label: '删除配置',
          description: '删除一套不再使用的 profile',
          value: 'remove',
        },
        {
          label: '查看当前配置',
          description: '打印当前 profile 详情',
          value: 'show',
        },
        {
          label: '测试当前配置',
          description: '向当前上游发起一次连通性测试',
          value: 'test',
        },
        {
          label: '初始化运行环境',
          description: '把 legacy 运行配置复制到 ~/.cumt/runtime',
          value: 'init',
        },
        {
          label: '退出',
          description: '结束配置程序',
          value: 'exit',
        },
      ]);

      if (action.value === 'edit') {
        const nextConfig = await editProfileInteractively(
          rl,
          activeProfile,
          activeConfig,
        );
        process.stdout.write('\n当前配置已保存。\n');
        printJson(renderConfigSummary(activeProfile, nextConfig));
        process.stdout.write('\n');
        continue;
      }

      if (action.value === 'create') {
        const profileName = await promptProfileName(rl, '新配置名称', 'default');
        const baseConfig =
          getRuntimeProfiles()[profileName] || { ...DEFAULT_RUNTIME_CONFIG };
        const nextConfig = await editProfileInteractively(rl, profileName, baseConfig);
        process.stdout.write('\n新配置已创建并激活。\n');
        printJson(renderConfigSummary(profileName, nextConfig));
        process.stdout.write('\n');
        continue;
      }

      if (action.value === 'switch') {
        const profileNames = Object.keys(getRuntimeProfiles());
        const selected = await promptChoice(
          rl,
          '选择要激活的配置',
          profileNames.map(profileName => ({
            label: profileName,
            description:
              profileName === activeProfile ? '当前已激活' : '切换到这个配置',
            value: profileName,
          })),
        );
        await setActiveRuntimeProfile(selected.value);
        process.stdout.write(`\n已切换到 ${selected.value}。\n\n`);
        continue;
      }

      if (action.value === 'remove') {
        const profileNames = Object.keys(getRuntimeProfiles()).filter(
          profileName => profileName !== activeProfile,
        );
        if (profileNames.length === 0) {
          process.stdout.write('\n当前只有一个配置，不能删除。\n\n');
          continue;
        }
        const selected = await promptChoice(
          rl,
          '选择要删除的配置',
          profileNames.map(profileName => ({
            label: profileName,
            description: '删除这个 profile',
            value: profileName,
          })),
        );
        await deleteRuntimeProfile(selected.value);
        await clearRuntimeAuth(selected.value);
        process.stdout.write(`\n已删除 ${selected.value}。\n\n`);
        continue;
      }

      if (action.value === 'show') {
        printJson(renderConfigSummary(activeProfile, activeConfig));
        process.stdout.write('\n');
        continue;
      }

      if (action.value === 'test') {
        const result = await runConnectivityTest(activeProfile);
        printJson({
          profile: activeProfile,
          ...result,
        });
        process.stdout.write('\n');
        continue;
      }

      if (action.value === 'init') {
        await initializeRuntimeHome();
        process.stdout.write(`\n已初始化 ${CUMT_RUNTIME_CONFIG_DIR}。\n\n`);
        continue;
      }

      return;
    }
  } finally {
    rl.close();
  }
}

async function runSetupWizard() {
  await initializeRuntimeHome();
  process.stdout.write(`${colorTitle('CUMT Code Setup')}\n`);
  process.stdout.write(
    `${ANSI_DIM}将依次完成运行目录初始化、上游配置、密钥写入和可选连通性测试。${ANSI_RESET}\n\n`,
  );
  await runConfigWizard();
}

function resolveApiKeyFromScopedAuth(scopedAuth, envKey) {
  if (!scopedAuth || typeof scopedAuth !== 'object') {
    return null;
  }
  if (typeof scopedAuth[envKey] === 'string' && scopedAuth[envKey]) {
    return scopedAuth[envKey];
  }
  return null;
}

async function resolveApiKey(profileName = getRuntimeProfileName()) {
  await loadRuntimeConfigIfNeeded();
  await migrateLegacyCumtHomeIfNeeded();
  const normalizedProfileName = normalizeProfileName(profileName);
  const activeConfig =
    getRuntimeProfiles()[normalizedProfileName] || getRuntimeConfig();
  const { envKey } = activeConfig;

  if (typeof process.env[envKey] === 'string' && process.env[envKey]) {
    return process.env[envKey];
  }

  const authStore = await loadRuntimeAuthStore();
  for (const scopedProfileName of [normalizedProfileName, 'default']) {
    const scopedAuth = authStore.profiles?.[scopedProfileName];
    const scopedApiKey = resolveApiKeyFromScopedAuth(scopedAuth, envKey);
    if (scopedApiKey) {
      return scopedApiKey;
    }
  }

  for (const authPath of [join(homedir(), '.codex', 'auth.json')]) {
    try {
      const raw = await readFile(authPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed[envKey] === 'string' && parsed[envKey]) {
        return parsed[envKey];
      }
    } catch {}
  }

  if (envKey !== 'OPENAI_API_KEY' && process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }

  if (envKey !== 'OPENAI_API_KEY') {
    for (const scopedProfileName of [normalizedProfileName, 'default']) {
      const scopedAuth = authStore.profiles?.[scopedProfileName];
      const fallbackOpenAIKey = resolveApiKeyFromScopedAuth(
        scopedAuth,
        'OPENAI_API_KEY',
      );
      if (fallbackOpenAIKey) {
        return fallbackOpenAIKey;
      }
    }

    for (const authPath of [join(homedir(), '.codex', 'auth.json')]) {
      try {
        const raw = await readFile(authPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed.OPENAI_API_KEY === 'string' && parsed.OPENAI_API_KEY) {
          return parsed.OPENAI_API_KEY;
        }
      } catch {}
    }
  }

  return null;
}

async function shouldAutoLaunchSetup(forwardArgs) {
  if (forwardArgs.length > 0) {
    return false;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const apiKey = await resolveApiKey();
  if (!apiKey) {
    return true;
  }

  if (!existsSync(CUMT_RUNTIME_CONFIG_DIR)) {
    return true;
  }

  return false;
}

function parseArgs(argv) {
  const args = [...argv];
  const proxyOnlyIndex = args.indexOf('--proxy-only');
  const proxyOnly = proxyOnlyIndex !== -1;
  if (proxyOnly) {
    args.splice(proxyOnlyIndex, 1);
  }
  return {
    proxyOnly,
    forwardArgs: args,
  };
}

function isPrintMode(args) {
  return args.includes('-p') || args.includes('--print');
}

function isVersionMode(args) {
  return args.length === 1 && ['-v', '-V', '--version'].includes(args[0]);
}

function isHelpMode(args) {
  return args.length === 1 && ['-h', '--help'].includes(args[0]);
}

function shouldRenderBanner(args) {
  if (!process.stderr.isTTY) {
    return false;
  }
  if (isPrintMode(args) || isVersionMode(args)) {
    return false;
  }
  return true;
}

function injectAppendSystemPrompt(args) {
  const nextArgs = [...args];
  const flag = '--append-system-prompt';

  for (let index = 0; index < nextArgs.length; index += 1) {
    const current = nextArgs[index];
    if (current === flag && typeof nextArgs[index + 1] === 'string') {
      nextArgs[index + 1] =
        `${nextArgs[index + 1]}\n\n${DEFAULT_APPEND_SYSTEM_PROMPT}`;
      return nextArgs;
    }
    if (current.startsWith(`${flag}=`)) {
      nextArgs[index] =
        `${flag}=${current.slice(flag.length + 1)}\n\n${DEFAULT_APPEND_SYSTEM_PROMPT}`;
      return nextArgs;
    }
  }

  nextArgs.push(flag, DEFAULT_APPEND_SYSTEM_PROMPT);
  return nextArgs;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function extractFlagValues(args, flag) {
  const values = [];
  const remainingArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === flag) {
      const nextValue = args[index + 1];
      if (typeof nextValue !== 'string') {
        throw new Error(`Flag ${flag} requires a value.`);
      }
      values.push(nextValue);
      index += 1;
      continue;
    }

    if (typeof current === 'string' && current.startsWith(`${flag}=`)) {
      values.push(current.slice(flag.length + 1));
      continue;
    }

    remainingArgs.push(current);
  }

  return {
    values,
    remainingArgs,
  };
}

function mergeSettings(baseSettings, overrides) {
  return {
    ...baseSettings,
    ...overrides,
  };
}

async function readSettingsValue(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return {};
  }

  const trimmedValue = rawValue.trim();
  const looksLikeJson =
    trimmedValue.startsWith('{') && trimmedValue.endsWith('}');
  if (looksLikeJson) {
    const parsed = JSON.parse(trimmedValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('--settings JSON must be an object.');
    }
    return parsed;
  }

  const parsed = await readJsonFile(trimmedValue);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Unable to read settings JSON from ${trimmedValue}.`);
  }
  return parsed;
}

function readManagedSettings(baseSettings = {}) {
  const existingAnnouncements = Array.isArray(baseSettings.companyAnnouncements)
    ? baseSettings.companyAnnouncements.filter(
        item => typeof item === 'string' && item.trim().length > 0,
      )
    : [];

  return {
    statusLine: {
      type: 'command',
      command: `${shellQuote(process.execPath)} ${shellQuote(
        SELF_SCRIPT_PATH,
      )} statusline`,
      padding: 1,
    },
    companyAnnouncements: [
      DEFAULT_COMPANY_ANNOUNCEMENT,
      ...existingAnnouncements.filter(
        item => item !== DEFAULT_COMPANY_ANNOUNCEMENT,
      ),
    ],
  };
}

async function injectManagedSettings(args) {
  const { values, remainingArgs } = extractFlagValues(args, '--settings');
  let mergedSettings = {};

  for (const value of values) {
    mergedSettings = mergeSettings(
      mergedSettings,
      await readSettingsValue(value),
    );
  }

  mergedSettings = mergeSettings(
    mergedSettings,
    readManagedSettings(mergedSettings),
  );

  return [
    ...remainingArgs,
    '--settings',
    JSON.stringify(mergedSettings),
  ];
}

async function buildManagedRuntimeArgs(forwardArgs) {
  const withPrompt = injectAppendSystemPrompt(forwardArgs);
  return injectManagedSettings(withPrompt);
}

function colorize(text, color) {
  return `${color}${text}${ANSI_RESET}`;
}

function renderBrandBanner(port) {
  const config = getRuntimeConfig();
  const title = colorize(
    `${ANSI_BOLD}CUMT Code${ANSI_RESET}${ANSI_KUANGDA_BLUE} | 矿大蓝主题`,
    ANSI_KUANGDA_BLUE,
  );
  const slogan = colorize(`▌ ${BRAND_SLOGAN} ▐`, ANSI_KUANGDA_BLUE);
  const meta = [
    `profile=${getRuntimeProfileName()}`,
    `theme=#1e3264`,
    `proxy=http://${DEFAULT_PROXY_HOST}:${port}`,
    `upstream=${config.baseUrl}`,
    `model=${config.model}`,
  ].join('  ');
  return `${title}\n${slogan}\n${colorize(meta, ANSI_DIM)}`;
}

async function readStdinUtf8() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function renderStatusLine(statusInput) {
  const config = getRuntimeConfig();
  const currentDir =
    typeof statusInput?.workspace?.current_dir === 'string' &&
    statusInput.workspace.current_dir.length > 0
      ? basename(statusInput.workspace.current_dir)
      : basename(process.cwd());
  const contextUsage = formatPercent(
    statusInput?.context_window?.used_percentage,
  );
  const separator = colorize(' | ', ANSI_DIM);

  return [
    colorize(`${ANSI_BOLD}CUMT Code${ANSI_RESET}`, ANSI_KUANGDA_BLUE),
    colorize(AGENT_NAME, ANSI_KUANGDA_BLUE),
    colorize(`${getRuntimeProfileName()}:${config.provider}/${config.model}`, ANSI_DIM),
    currentDir,
    colorize(`ctx ${contextUsage}`, ANSI_DIM),
  ].join(separator);
}

function maskSecret(secret) {
  if (typeof secret !== 'string' || secret.length === 0) {
    return '(missing)';
  }
  if (secret.length <= 10) {
    return `${secret.slice(0, 2)}***${secret.slice(-2)}`;
  }
  return `${secret.slice(0, 6)}***${secret.slice(-4)}`;
}

async function readJsonFile(path) {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readJsonFileIfExists(path) {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function getManagedRuntimeConfigHomeDir() {
  return process.env.CLAUDE_CONFIG_DIR || CUMT_RUNTIME_CONFIG_DIR;
}

function getManagedGlobalConfigFile() {
  const legacyPath = join(getManagedRuntimeConfigHomeDir(), '.config.json');
  if (existsSync(legacyPath)) {
    return legacyPath;
  }
  return join(getManagedRuntimeConfigHomeDir(), '.claude.json');
}

function normalizeApiKeyForManagedConfig(apiKey) {
  return String(apiKey).slice(-20);
}

async function ensureManagedApiKeyApproval() {
  await initializeRuntimeHome();
  const configPath = getManagedGlobalConfigFile();
  const currentConfig = (await readJsonFileIfExists(configPath)) || {};
  const approvedKey = normalizeApiKeyForManagedConfig(MANAGED_RUNTIME_API_KEY);
  const approved = Array.isArray(currentConfig.customApiKeyResponses?.approved)
    ? currentConfig.customApiKeyResponses.approved
    : [];
  const rejected = Array.isArray(currentConfig.customApiKeyResponses?.rejected)
    ? currentConfig.customApiKeyResponses.rejected
    : [];

  if (approved.includes(approvedKey) && !rejected.includes(approvedKey)) {
    return;
  }

  const nextConfig = {
    ...currentConfig,
    customApiKeyResponses: {
      ...currentConfig.customApiKeyResponses,
      approved: approved.includes(approvedKey)
        ? approved
        : [...approved, approvedKey],
      rejected: rejected.filter(item => item !== approvedKey),
    },
    opus1mMergeNoticeSeenCount: Math.max(
      Number(currentConfig.opus1mMergeNoticeSeenCount) || 0,
      6,
    ),
  };

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
}

function getRuntimeCliScriptPath() {
  return join(
    PACKAGE_ROOT,
    'node_modules',
    '@anthropic-ai',
    'claude-code',
    'cli.js',
  );
}

function getRuntimeLaunchSpec(forwardArgs = []) {
  const runtimeCliPath = getRuntimeCliScriptPath();
  if (!existsSync(runtimeCliPath)) {
    throw new Error(
      `Runtime script not found at ${runtimeCliPath}. Run npm install first.`,
    );
  }

  return {
    command: process.execPath,
    args: [runtimeCliPath, ...forwardArgs],
  };
}

function buildRuntimeBuiltinCommandPatch() {
  const scriptPathLiteral = JSON.stringify(SELF_SCRIPT_PATH);
  return `/* ${RUNTIME_BUILTIN_COMMAND_PATCH_MARKER} */
globalThis.cumtBuiltinCommandRunner=async function(q,K){let {execFileSync:_}=await import("node:child_process");try{let z=_(process.execPath,[${scriptPathLiteral},...q],{encoding:"utf8",stdio:["ignore","pipe","pipe"],env:process.env,maxBuffer:1048576});let Y=typeof z==="string"?z:String(z??"");return{type:"text",value:Y.trim()||K};}catch(z){let Y=[z?.stdout,z?.stderr,z?.message].filter(($)=>typeof $==="string"&&$.trim().length>0).join("\\n").trim();throw Error(Y||"CUMT built-in command failed");}},
globalThis.cumtProfilesBuiltinCommand={type:"local",name:"cumt-profiles",supportsNonInteractive:!0,description:"查看当前可用的 CUMT 配置",load:()=>Promise.resolve({call:()=>globalThis.cumtBuiltinCommandRunner(["config","profiles"],"暂无配置")})},
globalThis.cumtUseBuiltinCommand={type:"local",name:"cumt-use",supportsNonInteractive:!0,description:"切换当前 CUMT 配置 profile，下一条消息立即生效",argumentHint:"<profile>",load:()=>Promise.resolve({call:(q)=>{let K=q?.trim();if(!K)return{type:"text",value:"Usage: /cumt-use <profile>"};return globalThis.cumtBuiltinCommandRunner(["config","use",K],"切换已完成");}})},
globalThis.cumtModelBuiltinCommand={type:"local",name:"cumt-model",supportsNonInteractive:!0,description:"切换当前 profile 的模型，下一条消息立即生效",argumentHint:"<model>",load:()=>Promise.resolve({call:(q)=>{let K=q?.trim();if(!K)return{type:"text",value:"Usage: /cumt-model <model>"};return globalThis.cumtBuiltinCommandRunner(["config","set-model",K],"模型已更新");}})},
globalThis.cumtPresetBuiltinCommand={type:"local",name:"cumt-preset",supportsNonInteractive:!0,description:"把当前 profile 切换到指定 provider 预设，下一条消息立即生效",argumentHint:"<preset>",load:()=>Promise.resolve({call:(q)=>{let K=q?.trim();if(!K)return globalThis.cumtBuiltinCommandRunner(["config","presets"],"暂无预设");return globalThis.cumtBuiltinCommandRunner(["config","apply-preset",K],"预设已应用");}})},
`;
}

function applyRuntimeBuiltinCommandPatch(runtimeSource) {
  const patchedPrefix =
    `${buildRuntimeBuiltinCommandPatch()}v_7=$1(()=>[globalThis.cumtProfilesBuiltinCommand,` +
    'globalThis.cumtUseBuiltinCommand,globalThis.cumtModelBuiltinCommand,' +
    'globalThis.cumtPresetBuiltinCommand,hvK,LmK,';
  const patchedPattern = new RegExp(
    `/\\* ${RUNTIME_BUILTIN_COMMAND_PATCH_MARKER} \\*/[\\s\\S]*?` +
      'v_7=\\$1\\(\\(\\)=>\\[[\\s\\S]*?hvK,LmK,',
  );

  if (runtimeSource.includes(RUNTIME_BUILTIN_COMMAND_PATCH_MARKER)) {
    return runtimeSource.replace(patchedPattern, patchedPrefix);
  }

  if (!runtimeSource.includes(RUNTIME_BUILTIN_COMMAND_ARRAY_NEEDLE)) {
    return runtimeSource;
  }

  return runtimeSource.replace(
    RUNTIME_BUILTIN_COMMAND_ARRAY_NEEDLE,
    patchedPrefix,
  );
}

async function applyRuntimeBrandPatchIfNeeded() {
  const runtimeCliPath = getRuntimeCliScriptPath();
  if (!existsSync(runtimeCliPath)) {
    return false;
  }

  const rawRuntime = await readFile(runtimeCliPath, 'utf8');
  let patchedRuntime = rawRuntime;

  for (const [needle, replacement] of DEFAULT_RUNTIME_BRAND_REPLACEMENTS) {
    patchedRuntime = patchedRuntime.replaceAll(needle, replacement);
  }

  patchedRuntime = applyRuntimeBuiltinCommandPatch(patchedRuntime);
  const hasBuiltinCumtCommands = patchedRuntime.includes(
    RUNTIME_BUILTIN_COMMAND_PATCH_MARKER,
  );

  if (patchedRuntime === rawRuntime) {
    return hasBuiltinCumtCommands;
  }

  await writeFile(runtimeCliPath, patchedRuntime, 'utf8');
  return hasBuiltinCumtCommands;
}

function systemToString(system) {
  if (!system) {
    return '';
  }
  if (typeof system === 'string') {
    return system;
  }
  if (!Array.isArray(system)) {
    return '';
  }

  return system
    .map(block => {
      if (block?.type === 'text' && typeof block.text === 'string') {
        return block.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function stringifyJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeTextContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(part => {
      if (typeof part === 'string') {
        return part;
      }
      if (part?.type === 'text' && typeof part.text === 'string') {
        return part.text;
      }
      if (part?.type === 'image') {
        return '[image omitted by adapter]';
      }
      if (part?.type === 'document') {
        return '[document omitted by adapter]';
      }
      return stringifyJson(part);
    })
    .join('\n');
}

function serializeMessageContent(role, content) {
  const roleLabel = role === 'assistant' ? 'ASSISTANT' : 'USER';
  if (typeof content === 'string') {
    return [`${roleLabel}:\n${content}`];
  }
  if (!Array.isArray(content)) {
    return [];
  }

  const lines = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue;
    }

    switch (block.type) {
      case 'text':
        lines.push(`${roleLabel}:\n${block.text || ''}`);
        break;
      case 'tool_use':
        lines.push(
          [
            `ASSISTANT_TOOL_USE id=${block.id} name=${block.name}`,
            'INPUT_JSON:',
            stringifyJson(block.input ?? {}),
          ].join('\n'),
        );
        break;
      case 'tool_result':
        lines.push(
          [
            `USER_TOOL_RESULT tool_use_id=${block.tool_use_id} is_error=${block.is_error === true}`,
            'CONTENT:',
            normalizeTextContent(block.content),
          ].join('\n'),
        );
        break;
      case 'thinking':
      case 'redacted_thinking':
        break;
      case 'image':
        lines.push(`${roleLabel}:\n[image omitted by adapter]`);
        break;
      case 'document':
        lines.push(`${roleLabel}:\n[document omitted by adapter]`);
        break;
      default:
        lines.push(`${roleLabel}:\n${stringifyJson(block)}`);
        break;
    }
  }

  return lines;
}

function messagesToTranscript(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'USER:\nHello';
  }

  const lines = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue;
    }
    lines.push(...serializeMessageContent(message.role, message.content));
  }

  return lines.filter(Boolean).join('\n\n');
}

function normalizeOpenAIMessageContent(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(part => {
      if (typeof part === 'string') {
        return part;
      }
      if (!part || typeof part !== 'object') {
        return '';
      }
      if (
        (part.type === 'text' ||
          part.type === 'input_text' ||
          part.type === 'output_text') &&
        typeof part.text === 'string'
      ) {
        return part.text;
      }
      if (part.type === 'image_url' || part.type === 'input_image') {
        return '[image omitted by adapter]';
      }
      if (part.type === 'input_file' || part.type === 'file') {
        return '[document omitted by adapter]';
      }
      return stringifyJson(part);
    })
    .filter(Boolean)
    .join('\n');
}

function serializeOpenAIChatMessage(message) {
  if (!message || typeof message !== 'object') {
    return [];
  }

  const role = typeof message.role === 'string' ? message.role : 'user';
  const textContent = normalizeOpenAIMessageContent(message.content);
  const lines = [];

  if (role === 'tool' || role === 'function') {
    lines.push(
      [
        `USER_TOOL_RESULT tool_use_id=${message.tool_call_id || message.name || 'unknown_tool'} is_error=false`,
        'CONTENT:',
        textContent || '[empty tool result]',
      ].join('\n'),
    );
    return lines;
  }

  const roleLabel =
    role === 'assistant'
      ? 'ASSISTANT'
      : role === 'system'
        ? 'SYSTEM'
        : role === 'developer'
          ? 'DEVELOPER'
          : 'USER';

  if (textContent) {
    lines.push(`${roleLabel}:\n${textContent}`);
  }

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      const functionDef =
        toolCall?.type === 'function' && toolCall.function
          ? toolCall.function
          : toolCall;
      if (!functionDef || typeof functionDef !== 'object') {
        continue;
      }
      lines.push(
        [
          `ASSISTANT_TOOL_USE id=${toolCall.id || toolCall.call_id || randomUUID()} name=${functionDef.name || 'unknown_tool'}`,
          'INPUT_JSON:',
          typeof functionDef.arguments === 'string'
            ? functionDef.arguments
            : stringifyJson(functionDef.arguments ?? {}),
        ].join('\n'),
      );
    }
  }

  if (
    role === 'assistant' &&
    message.function_call &&
    typeof message.function_call === 'object'
  ) {
    lines.push(
      [
        `ASSISTANT_TOOL_USE id=${message.function_call.call_id || randomUUID()} name=${message.function_call.name || 'unknown_tool'}`,
        'INPUT_JSON:',
        typeof message.function_call.arguments === 'string'
          ? message.function_call.arguments
          : stringifyJson(message.function_call.arguments ?? {}),
      ].join('\n'),
    );
  }

  return lines;
}

function chatMessagesToTranscript(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'USER:\nHello';
  }

  const lines = [];
  for (const message of messages) {
    lines.push(...serializeOpenAIChatMessage(message));
  }
  return lines.filter(Boolean).join('\n\n');
}

function convertToolChoice(toolChoice) {
  if (!toolChoice) {
    return 'auto';
  }
  if (typeof toolChoice === 'string') {
    return toolChoice === 'any' ? 'required' : toolChoice;
  }
  if (toolChoice.type === 'auto') {
    return 'auto';
  }
  if (toolChoice.type === 'any') {
    return 'required';
  }
  if (toolChoice.type === 'tool' && typeof toolChoice.name === 'string') {
    return {
      type: 'function',
      name: toolChoice.name,
    };
  }
  return 'auto';
}

function convertTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }

  return tools
    .filter(tool => tool && typeof tool === 'object' && tool.name)
    .map(tool => ({
      type: 'function',
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || tool.parameters || {
        type: 'object',
        properties: {},
      },
      strict: tool.strict ?? false,
    }));
}

function convertOpenAIToolChoice(toolChoice) {
  if (!toolChoice) {
    return 'auto';
  }
  if (typeof toolChoice === 'string') {
    return toolChoice;
  }
  if (
    toolChoice.type === 'function' &&
    toolChoice.function &&
    typeof toolChoice.function.name === 'string'
  ) {
    return {
      type: 'function',
      name: toolChoice.function.name,
    };
  }
  return 'auto';
}

function convertOpenAITools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }

  return tools
    .map(tool => {
      if (!tool || typeof tool !== 'object') {
        return null;
      }

      if (tool.type === 'function' && tool.function) {
        return {
          type: 'function',
          name: tool.function.name,
          description: tool.function.description || '',
          parameters: tool.function.parameters || {
            type: 'object',
            properties: {},
          },
          strict: tool.function.strict ?? false,
        };
      }

      if (tool.type === 'function' && tool.name) {
        return {
          type: 'function',
          name: tool.name,
          description: tool.description || '',
          parameters: tool.parameters || {
            type: 'object',
            properties: {},
          },
          strict: tool.strict ?? false,
        };
      }

      return null;
    })
    .filter(Boolean);
}

function mapThinkingToReasoning(thinking) {
  const config = getRuntimeConfig();
  if (thinking?.type === 'disabled') {
    return {
      effort: 'none',
      summary: null,
    };
  }

  return {
    effort: config.reasoningEffort,
    summary: null,
  };
}

function buildUpstreamRequest(anthropicBody) {
  const systemText = systemToString(anthropicBody.system);
  const transcript = messagesToTranscript(anthropicBody.messages);
  const instructions = [ADAPTER_INSTRUCTIONS, systemText]
    .filter(Boolean)
    .join('\n\n');

  const upstreamBody = applyOpenAIDefaults({
    model: resolveAnthropicUpstreamModel(anthropicBody.model),
    instructions,
    input: transcript,
    stream: Boolean(anthropicBody.stream),
    reasoning: mapThinkingToReasoning(anthropicBody.thinking),
  });

  if (typeof anthropicBody.max_tokens === 'number') {
    upstreamBody.max_output_tokens = anthropicBody.max_tokens;
  }
  if (typeof anthropicBody.temperature === 'number') {
    upstreamBody.temperature = anthropicBody.temperature;
  }
  if (typeof anthropicBody.top_p === 'number') {
    upstreamBody.top_p = anthropicBody.top_p;
  }

  const tools = convertTools(anthropicBody.tools);
  if (tools && tools.length > 0) {
    upstreamBody.tools = tools;
    upstreamBody.tool_choice = convertToolChoice(anthropicBody.tool_choice);
  }

  return upstreamBody;
}

function buildResponsesUpstreamRequest(openaiBody = {}) {
  const upstreamBody = applyOpenAIDefaults(
    {
      ...openaiBody,
      model: resolveRequestedModel(openaiBody.model),
    },
    {
      defaultStream: Boolean(openaiBody.stream),
    },
  );

  if (
    upstreamBody.input === undefined &&
    Array.isArray(openaiBody.messages) &&
    openaiBody.messages.length > 0
  ) {
    upstreamBody.input = chatMessagesToTranscript(openaiBody.messages);
  }
  if (
    typeof openaiBody.max_tokens === 'number' &&
    typeof upstreamBody.max_output_tokens !== 'number'
  ) {
    upstreamBody.max_output_tokens = openaiBody.max_tokens;
  }

  const tools = convertOpenAITools(openaiBody.tools);
  if (tools && tools.length > 0) {
    upstreamBody.tools = tools;
    if (openaiBody.tool_choice !== undefined) {
      upstreamBody.tool_choice = convertOpenAIToolChoice(openaiBody.tool_choice);
    }
  }

  return upstreamBody;
}

function buildChatCompletionsUpstreamRequest(chatBody = {}) {
  const transcript = chatMessagesToTranscript(chatBody.messages);
  const instructions = [
    ADAPTER_INSTRUCTIONS,
    'This request originated from an OpenAI Chat Completions compatible endpoint.',
  ].join('\n\n');

  const upstreamBody = applyOpenAIDefaults(
    {
      model: resolveRequestedModel(chatBody.model),
      instructions,
      input: transcript,
      stream: Boolean(chatBody.stream),
    },
    {
      defaultStream: Boolean(chatBody.stream),
    },
  );

  if (typeof chatBody.max_completion_tokens === 'number') {
    upstreamBody.max_output_tokens = chatBody.max_completion_tokens;
  } else if (typeof chatBody.max_tokens === 'number') {
    upstreamBody.max_output_tokens = chatBody.max_tokens;
  }
  if (typeof chatBody.temperature === 'number') {
    upstreamBody.temperature = chatBody.temperature;
  }
  if (typeof chatBody.top_p === 'number') {
    upstreamBody.top_p = chatBody.top_p;
  }

  const tools = convertOpenAITools(chatBody.tools);
  if (tools && tools.length > 0) {
    upstreamBody.tools = tools;
    upstreamBody.tool_choice = convertOpenAIToolChoice(chatBody.tool_choice);
  }

  return upstreamBody;
}

function buildUpstreamHeaders(apiKey, accept = 'text/event-stream') {
  const sessionId = randomUUID();
  const turnId = randomUUID();

  return {
    Accept: accept,
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': CODEX_USER_AGENT,
    originator: CODEX_ORIGINATOR,
    session_id: sessionId,
    'x-client-request-id': sessionId,
    'x-codex-turn-metadata': JSON.stringify({
      session_id: sessionId,
      turn_id: turnId,
      sandbox: 'seccomp',
    }),
  };
}

function parseSseEvent(rawEvent) {
  const lines = rawEvent
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean);

  let event = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  return {
    event,
    data: dataLines.join('\n'),
  };
}

async function collectCompletedResponse(response) {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`upstream ${response.status}: ${body}`);
  }
  if (!response.body) {
    throw new Error('upstream stream body missing');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let completedResponse = null;

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';

    for (const rawEvent of events) {
      const { event, data } = parseSseEvent(rawEvent);
      if (!data) {
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      if (event === 'error' || parsed.type === 'error') {
        throw new Error(typeof data === 'string' ? data : stringifyJson(parsed));
      }

      if (parsed.type === 'response.completed' && parsed.response) {
        completedResponse = parsed.response;
        return completedResponse;
      }
    }
  }

  if (completedResponse) {
    return completedResponse;
  }

  throw new Error('upstream stream completed without response.completed');
}

function safeParseJson(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {
      raw,
    };
  }
}

function mapOutputToAnthropicContent(output) {
  if (!Array.isArray(output)) {
    return [];
  }

  const content = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === 'output_text' && typeof part.text === 'string') {
          if (part.text.length > 0) {
            content.push({
              type: 'text',
              text: part.text,
            });
          }
        }
      }
      continue;
    }

    if (item.type === 'function_call') {
      content.push({
        type: 'tool_use',
        id: item.call_id || item.id || randomUUID(),
        name: item.name || 'unknown_tool',
        input: safeParseJson(item.arguments),
      });
    }
  }

  return content;
}

function extractTextFromResponseOutput(output) {
  if (!Array.isArray(output)) {
    return '';
  }

  return output
    .flatMap(item =>
      item?.type === 'message' && Array.isArray(item.content)
        ? item.content
            .filter(
              part =>
                (part?.type === 'output_text' || part?.type === 'text') &&
                typeof part.text === 'string',
            )
            .map(part => part.text || '')
        : [],
    )
    .join('')
    .trim();
}

function mapOutputToOpenAIToolCalls(output) {
  if (!Array.isArray(output)) {
    return [];
  }

  return output
    .filter(item => item?.type === 'function_call')
    .map((item, index) => ({
      index,
      id: item.call_id || item.id || randomUUID(),
      type: 'function',
      function: {
        name: item.name || 'unknown_tool',
        arguments:
          typeof item.arguments === 'string'
            ? item.arguments
            : stringifyJson(item.arguments ?? {}),
      },
    }));
}

function extractAnthropicText(content) {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text || '')
    .join('')
    .trim();
}

function mapUsage(responseUsage = {}) {
  return {
    input_tokens: responseUsage.input_tokens || 0,
    output_tokens: responseUsage.output_tokens || 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens:
      responseUsage.input_tokens_details?.cached_tokens || 0,
    server_tool_use: {
      web_search_requests: responseUsage.tool_usage?.web_search?.num_requests || 0,
      web_fetch_requests: 0,
    },
  };
}

function mapOpenAIUsage(responseUsage = {}) {
  const promptTokens = responseUsage.input_tokens || 0;
  const completionTokens = responseUsage.output_tokens || 0;

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_tokens_details: {
      cached_tokens: responseUsage.input_tokens_details?.cached_tokens || 0,
    },
  };
}

function toUnixTimestampSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }
  return Math.floor(Date.now() / 1000);
}

function buildAnthropicMessage(anthropicBody, completedResponse) {
  const config = getRuntimeConfig();
  const content = mapOutputToAnthropicContent(completedResponse.output);
  return {
    id: completedResponse.id || `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: completedResponse.model || config.model,
    content,
    stop_reason: content.some(block => block.type === 'tool_use')
      ? 'tool_use'
      : 'end_turn',
    stop_sequence: null,
    usage: mapUsage(completedResponse.usage),
  };
}

function buildOpenAIChatCompletion(chatBody, completedResponse) {
  const config = getRuntimeConfig();
  const content = extractTextFromResponseOutput(completedResponse.output);
  const toolCalls = mapOutputToOpenAIToolCalls(completedResponse.output);

  return {
    id: completedResponse.id || `chatcmpl_${randomUUID()}`,
    object: 'chat.completion',
    created: toUnixTimestampSeconds(
      completedResponse.created_at || completedResponse.created,
    ),
    model:
      resolveRequestedModel(
        chatBody.model || completedResponse.model,
        config.model,
      ),
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: content || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : null,
          function_call: null,
        },
        logprobs: null,
        finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      },
    ],
    usage: mapOpenAIUsage(completedResponse.usage),
    service_tier: config.serviceTier || null,
    system_fingerprint: null,
  };
}

function blockForStreamStart(block) {
  if (block.type === 'tool_use') {
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: {},
    };
  }

  return {
    type: 'text',
    text: '',
  };
}

function deltaForBlock(block) {
  if (block.type === 'tool_use') {
    return {
      type: 'input_json_delta',
      partial_json: stringifyJson(block.input || {}),
    };
  }

  return {
    type: 'text_delta',
    text: block.text || '',
  };
}

function writeSseEvent(res, type, payload) {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function emitAnthropicStream(res, anthropicMessage, requestId) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'request-id': requestId,
  });

  writeSseEvent(res, 'message_start', {
    type: 'message_start',
    message: {
      ...anthropicMessage,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        ...anthropicMessage.usage,
        output_tokens: 0,
      },
    },
  });

  anthropicMessage.content.forEach((block, index) => {
    writeSseEvent(res, 'content_block_start', {
      type: 'content_block_start',
      index,
      content_block: blockForStreamStart(block),
    });
    writeSseEvent(res, 'content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: deltaForBlock(block),
    });
    writeSseEvent(res, 'content_block_stop', {
      type: 'content_block_stop',
      index,
    });
  });

  writeSseEvent(res, 'message_delta', {
    type: 'message_delta',
    delta: {
      stop_reason: anthropicMessage.stop_reason,
      stop_sequence: null,
    },
    usage: anthropicMessage.usage,
  });

  writeSseEvent(res, 'message_stop', {
    type: 'message_stop',
  });

  res.end();
}

function writeOpenAISseData(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function emitOpenAIChatStream(res, chatResponse, includeUsage = false) {
  const choice = chatResponse.choices[0];
  const toolCalls = Array.isArray(choice.message.tool_calls)
    ? choice.message.tool_calls
    : [];
  const baseChunk = {
    id: chatResponse.id,
    object: 'chat.completion.chunk',
    created: chatResponse.created,
    model: chatResponse.model,
    system_fingerprint: chatResponse.system_fingerprint,
  };

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  writeOpenAISseData(res, {
    ...baseChunk,
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          content: '',
        },
        logprobs: null,
        finish_reason: null,
      },
    ],
    usage: null,
  });

  if (typeof choice.message.content === 'string' && choice.message.content.length > 0) {
    writeOpenAISseData(res, {
      ...baseChunk,
      choices: [
        {
          index: 0,
          delta: {
            content: choice.message.content,
          },
          logprobs: null,
          finish_reason: null,
        },
      ],
      usage: null,
    });
  }

  for (const toolCall of toolCalls) {
    writeOpenAISseData(res, {
      ...baseChunk,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: toolCall.index,
                id: toolCall.id,
                type: 'function',
                function: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                },
              },
            ],
          },
          logprobs: null,
          finish_reason: null,
        },
      ],
      usage: null,
    });
  }

  writeOpenAISseData(res, {
    ...baseChunk,
    choices: [
      {
        index: 0,
        delta: {},
        logprobs: null,
        finish_reason: choice.finish_reason,
      },
    ],
    usage: null,
  });

  if (includeUsage) {
    writeOpenAISseData(res, {
      ...baseChunk,
      choices: [],
      usage: chatResponse.usage,
    });
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

async function createUpstreamRequest(apiKey, upstreamBody, stream = false) {
  const config = getRuntimeConfig();
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: buildUpstreamHeaders(
      apiKey,
      stream ? 'text/event-stream' : 'application/json',
    ),
    body: JSON.stringify(upstreamBody),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`upstream ${response.status}: ${body}`);
    error.statusCode = response.status;
    error.responseBody = body;
    error.contentType = response.headers.get('content-type') || 'application/json';
    throw error;
  }

  return response;
}

function buildAnthropicUpstreamHeaders(apiKey, accept = 'application/json') {
  return {
    Accept: accept,
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': CODEX_USER_AGENT,
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
}

async function createAnthropicUpstreamRequest(apiKey, upstreamBody, stream = false) {
  const config = getRuntimeConfig();
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: buildAnthropicUpstreamHeaders(
      apiKey,
      stream ? 'text/event-stream' : 'application/json',
    ),
    body: JSON.stringify(upstreamBody),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`upstream ${response.status}: ${body}`);
    error.statusCode = response.status;
    error.responseBody = body;
    error.contentType = response.headers.get('content-type') || 'application/json';
    throw error;
  }

  return response;
}

async function readUpstreamJsonResponse(response) {
  const rawBody = await response.text();
  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error(`upstream returned invalid JSON: ${rawBody}`);
  }
}

async function pipeUpstreamSse(res, upstreamResponse) {
  res.writeHead(200, {
    'content-type': upstreamResponse.headers.get('content-type') || 'text/event-stream',
    'cache-control': upstreamResponse.headers.get('cache-control') || 'no-cache',
    connection: upstreamResponse.headers.get('connection') || 'keep-alive',
  });

  for await (const chunk of upstreamResponse.body) {
    res.write(chunk);
  }
  res.end();
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function sendJson(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function extractErrorMessage(error) {
  if (typeof error?.responseBody === 'string' && error.responseBody.length > 0) {
    try {
      const parsed = JSON.parse(error.responseBody);
      if (typeof parsed?.error?.message === 'string' && parsed.error.message) {
        return parsed.error.message;
      }
      if (typeof parsed?.msg === 'string' && parsed.msg) {
        return parsed.msg;
      }
      if (typeof parsed?.message === 'string' && parsed.message) {
        return parsed.message;
      }
    } catch {
      return error.responseBody;
    }
    return error.responseBody;
  }
  return error instanceof Error ? error.message : 'proxy request failed';
}

function sendOpenAIError(res, statusCode, error, type = 'api_error') {
  sendJson(res, statusCode, {
    error: {
      message: extractErrorMessage(error),
      type,
    },
  });
}

async function handleMessages(req, res) {
  await refreshRuntimeConfig();
  const config = getRuntimeConfig();
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    sendJson(res, 401, {
      type: 'error',
      error: {
        type: 'authentication_error',
        message:
          `Missing ${config.envKey}; no saved key found in ${CUMT_AUTH_FILE} or ~/.codex/auth.json.`,
      },
    });
    return;
  }

  let anthropicBody;
  try {
    anthropicBody = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: error instanceof Error ? error.message : 'invalid JSON body',
      },
    });
    return;
  }

  try {
    if (config.wireApi === 'anthropic_messages') {
      const upstreamBody = {
        ...anthropicBody,
        model: resolveAnthropicUpstreamModel(anthropicBody.model),
      };
      const upstreamResponse = await createAnthropicUpstreamRequest(
        apiKey,
        upstreamBody,
        Boolean(anthropicBody.stream),
      );

      if (anthropicBody.stream) {
        await pipeUpstreamSse(res, upstreamResponse);
        return;
      }

      const messageBody = await readUpstreamJsonResponse(upstreamResponse);
      sendJson(res, 200, messageBody, {
        'request-id': messageBody.id || randomUUID(),
      });
      return;
    }

    if (config.wireApi !== 'responses') {
      throw new Error(
        `Unsupported wireApi: ${config.wireApi}. Current runtime supports responses and anthropic_messages.`,
      );
    }

    const upstreamBody = buildUpstreamRequest(anthropicBody);
    const upstreamResponse = await createUpstreamRequest(
      apiKey,
      upstreamBody,
      Boolean(anthropicBody.stream),
    );
    const completedResponse = anthropicBody.stream
      ? await collectCompletedResponse(upstreamResponse)
      : await readUpstreamJsonResponse(upstreamResponse);
    const anthropicMessage = buildAnthropicMessage(
      anthropicBody,
      completedResponse,
    );
    const requestId = completedResponse.id || randomUUID();

    if (anthropicBody.stream) {
      emitAnthropicStream(res, anthropicMessage, requestId);
      return;
    }

    sendJson(res, 200, anthropicMessage, {
      'request-id': requestId,
    });
  } catch (error) {
    const statusCode =
      typeof error?.statusCode === 'number' ? error.statusCode : 500;
    sendJson(res, statusCode, {
      type: 'error',
      error: {
        type: statusCode === 401 ? 'authentication_error' : 'api_error',
        message: extractErrorMessage(error),
      },
    });
  }
}

async function handleModels(_req, res) {
  await refreshRuntimeConfig();
  const modelId = getRuntimeConfig().model;
  sendJson(res, 200, {
    object: 'list',
    data: [
      {
        id: modelId,
        object: 'model',
        type: 'model',
        display_name: modelId,
        owned_by: 'cumt-code',
        created: Math.floor(Date.now() / 1000),
        created_at: new Date().toISOString(),
      },
    ],
    first_id: modelId,
    has_more: false,
    last_id: modelId,
  });
}

async function handleResponses(req, res) {
  await refreshRuntimeConfig();
  const config = getRuntimeConfig();
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    sendOpenAIError(
      res,
      401,
      new Error(
        `Missing ${config.envKey}; no saved key found in ${CUMT_AUTH_FILE} or ~/.codex/auth.json.`,
      ),
      'authentication_error',
    );
    return;
  }

  let openaiBody;
  try {
    openaiBody = await readJsonBody(req);
  } catch (error) {
    sendOpenAIError(res, 400, error, 'invalid_request_error');
    return;
  }

  try {
    if (config.wireApi !== 'responses') {
      throw new Error(
        `Unsupported wireApi: ${config.wireApi}. Current runtime supports responses-compatible upstreams only.`,
      );
    }

    const upstreamBody = buildResponsesUpstreamRequest(openaiBody);
    if (openaiBody.stream) {
      const upstreamResponse = await createUpstreamRequest(apiKey, upstreamBody, true);
      await pipeUpstreamSse(res, upstreamResponse);
      return;
    }

    const upstreamResponse = await createUpstreamRequest(apiKey, upstreamBody, false);
    const completedResponse = await readUpstreamJsonResponse(upstreamResponse);
    sendJson(res, 200, completedResponse, {
      'request-id': completedResponse.id || randomUUID(),
    });
  } catch (error) {
    const statusCode =
      typeof error?.statusCode === 'number' ? error.statusCode : 500;
    sendOpenAIError(res, statusCode, error);
  }
}

async function handleChatCompletions(req, res) {
  await refreshRuntimeConfig();
  const config = getRuntimeConfig();
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    sendOpenAIError(
      res,
      401,
      new Error(
        `Missing ${config.envKey}; no saved key found in ${CUMT_AUTH_FILE} or ~/.codex/auth.json.`,
      ),
      'authentication_error',
    );
    return;
  }

  let chatBody;
  try {
    chatBody = await readJsonBody(req);
  } catch (error) {
    sendOpenAIError(res, 400, error, 'invalid_request_error');
    return;
  }

  try {
    if (config.wireApi !== 'responses') {
      throw new Error(
        `Unsupported wireApi: ${config.wireApi}. Current runtime supports responses-compatible upstreams only.`,
      );
    }

    const upstreamBody = buildChatCompletionsUpstreamRequest(chatBody);
    const upstreamResponse = await createUpstreamRequest(
      apiKey,
      {
        ...upstreamBody,
        stream: false,
      },
      false,
    );
    const completedResponse = await readUpstreamJsonResponse(upstreamResponse);
    const chatCompletion = buildOpenAIChatCompletion(chatBody, completedResponse);

    if (chatBody.stream) {
      emitOpenAIChatStream(
        res,
        chatCompletion,
        chatBody.stream_options?.include_usage === true,
      );
      return;
    }

    sendJson(res, 200, chatCompletion, {
      'request-id': completedResponse.id || chatCompletion.id,
    });
  } catch (error) {
    const statusCode =
      typeof error?.statusCode === 'number' ? error.statusCode : 500;
    sendOpenAIError(res, statusCode, error);
  }
}

function createProxyServer() {
  return createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${DEFAULT_PROXY_HOST}`);
    const path = requestUrl.pathname;

    if (req.method === 'GET' && path === '/healthz') {
      sendJson(res, 200, {
        ok: true,
      });
      return;
    }

    if (req.method === 'GET' && (path === '/v1/models' || path === '/models')) {
      await handleModels(req, res);
      return;
    }

    if (req.method === 'POST' && (path === '/v1/messages' || path === '/messages')) {
      await handleMessages(req, res);
      return;
    }

    if (req.method === 'POST' && (path === '/v1/responses' || path === '/responses')) {
      await handleResponses(req, res);
      return;
    }

    if (
      req.method === 'POST' &&
      (path === '/v1/chat/completions' || path === '/chat/completions')
    ) {
      await handleChatCompletions(req, res);
      return;
    }

    sendJson(res, 404, {
      type: 'error',
      error: {
        type: 'not_found_error',
        message: `Unsupported path: ${path}`,
      },
    });
  });
}

async function listenOnPort(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, DEFAULT_PROXY_HOST, resolve);
  });
}

async function startProxyServer(preferredPort) {
  const maxOffset = Math.max(0, DEFAULT_PROXY_PORT_SCAN_SIZE);
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const port = preferredPort + offset;
    const server = createProxyServer();
    try {
      await listenOnPort(server, port);
      return {
        port,
        server,
      };
    } catch (error) {
      server.close();
      if (error?.code !== 'EADDRINUSE') {
        throw error;
      }
    }
  }

  throw new Error(
    `No available proxy port in range ${preferredPort}-${preferredPort + maxOffset}.`,
  );
}

function getBundledRipgrepPath() {
  return join(
    PACKAGE_ROOT,
    'node_modules',
    '@anthropic-ai',
    'claude-code',
    'vendor',
    'ripgrep',
    `${process.arch}-${process.platform}`,
    process.platform === 'win32' ? 'rg.exe' : 'rg',
  );
}

async function buildRuntimeBaseEnv() {
  const nextEnv = {
    ...process.env,
  };

  const bundledRipgrepPath = getBundledRipgrepPath();
  if (!existsSync(bundledRipgrepPath) || process.platform === 'win32') {
    return nextEnv;
  }

  try {
    await access(bundledRipgrepPath, fsConstants.X_OK);
    return nextEnv;
  } catch {
    try {
      await chmod(bundledRipgrepPath, 0o755);
      await access(bundledRipgrepPath, fsConstants.X_OK);
      return nextEnv;
    } catch {
      nextEnv.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH = '1';
      return nextEnv;
    }
  }
}

async function buildRuntimeChildEnv(port) {
  const config = getRuntimeConfig();
  const runtimeEnv = await buildRuntimeBaseEnv();
  return {
    ...runtimeEnv,
    ANTHROPIC_API_KEY: MANAGED_RUNTIME_API_KEY,
    ANTHROPIC_BASE_URL: `http://${DEFAULT_PROXY_HOST}:${port}`,
    ANTHROPIC_MODEL: config.compatModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: config.compatModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: config.compatModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL: config.compatModel,
    CLAUDE_CONFIG_DIR: CUMT_RUNTIME_CONFIG_DIR,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || '1',
    DISABLE_INSTALLATION_CHECKS:
      process.env.DISABLE_INSTALLATION_CHECKS || '1',
    CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
    CLAUDE_CODE_USE_BEDROCK: '',
    CLAUDE_CODE_USE_VERTEX: '',
    CLAUDE_CODE_USE_FOUNDRY: '',
  };
}

async function printStatusLine() {
  const rawInput = await readStdinUtf8();
  const statusInput = rawInput.trim().length > 0 ? safeParseJson(rawInput) : {};
  process.stdout.write(`${renderStatusLine(statusInput)}\n`);
}

async function printAuthStatus() {
  await loadRuntimeConfigIfNeeded();
  const config = getRuntimeConfig();
  const apiKey = await resolveApiKey();
  const lines = [
    'CUMT Code | 矿大蓝主题',
    `profile=${getRuntimeProfileName()}`,
    `agent=${AGENT_NAME}`,
    `provider=${config.provider}`,
    `wire_api=${config.wireApi}`,
    `auth_env=${config.envKey}`,
    `api_key=${maskSecret(apiKey)}`,
    `upstream=${config.baseUrl}`,
    `active_model=${config.model}`,
    `runtime_alias_model=${config.compatModel}`,
    `config_file=${CUMT_CONFIG_FILE}`,
    `auth_file=${CUMT_AUTH_FILE}`,
    `proxy=http://${DEFAULT_PROXY_HOST}:${DEFAULT_PROXY_PORT}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  if (!apiKey) {
    process.exitCode = 1;
  }
}

async function printVersion() {
  const rootPackage = await readJsonFile(join(PACKAGE_ROOT, 'package.json'));
  const runtimePackage = await readJsonFile(
    join(
      PACKAGE_ROOT,
      'node_modules',
      '@anthropic-ai',
      'claude-code',
      'package.json',
    ),
  );

  const cliVersion = rootPackage?.version || '0.0.0-local';
  const runtimeVersion = runtimePackage?.version || 'unknown';
  process.stdout.write(
    `CUMT Code ${cliVersion} (runtime ${runtimeVersion})\n`,
  );
}

async function runRuntimePassthrough(forwardArgs) {
  const runtimeLaunchSpec = getRuntimeLaunchSpec(forwardArgs);
  const hasBuiltinCumtCommands = await applyRuntimeBrandPatchIfNeeded();
  if (hasBuiltinCumtCommands) {
    await cleanupLegacySlashCommands();
  }
  const runtimeEnv = await buildRuntimeBaseEnv();

  await new Promise((resolve, reject) => {
    const child = spawn(runtimeLaunchSpec.command, runtimeLaunchSpec.args, {
      stdio: 'inherit',
      env: runtimeEnv,
    });

    child.once('error', reject);
    child.once('exit', code => {
      process.exit(code ?? 0);
    });
    child.once('close', resolve);
  });
}

async function runCumtViaProxy(forwardArgs) {
  await loadRuntimeConfigIfNeeded();
  const managedArgs = await buildManagedRuntimeArgs(forwardArgs);
  const runtimeLaunchSpec = getRuntimeLaunchSpec(managedArgs);
  await ensureManagedApiKeyApproval();
  const hasBuiltinCumtCommands = await applyRuntimeBrandPatchIfNeeded();
  if (hasBuiltinCumtCommands) {
    await cleanupLegacySlashCommands();
  }
  const { server, port } = await startProxyServer(DEFAULT_PROXY_PORT);
  const runtimeEnv = await buildRuntimeChildEnv(port);
  if (shouldRenderBanner(forwardArgs)) {
    process.stderr.write(`${renderBrandBanner(port)}\n`);
  }
  const child = spawn(runtimeLaunchSpec.command, runtimeLaunchSpec.args, {
    stdio: 'inherit',
    env: runtimeEnv,
  });

  const shutdown = () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  child.on('exit', code => {
    server.close(() => {
      process.exit(code ?? 0);
    });
  });
}

async function main() {
  const { proxyOnly, forwardArgs } = parseArgs(process.argv.slice(2));
  await loadRuntimeConfigIfNeeded();
  if (forwardArgs[0] === 'setup') {
    await runSetupWizard();
    return;
  }
  if (forwardArgs[0] === 'statusline') {
    await printStatusLine();
    return;
  }
  if (forwardArgs[0] === 'config' && forwardArgs[1] === 'show') {
    printJson(renderConfigSummary(getRuntimeProfileName(), getRuntimeConfig()));
    return;
  }
  if (forwardArgs[0] === 'config' && forwardArgs[1] === 'profiles') {
    printJson({
      activeProfile: getRuntimeProfileName(),
      profiles: Object.keys(getRuntimeProfiles()),
    });
    return;
  }
  if (forwardArgs[0] === 'config' && forwardArgs[1] === 'presets') {
    printJson(getPresetSummaries());
    return;
  }
  if (forwardArgs[0] === 'config' && forwardArgs[1] === 'test') {
    const profileName = forwardArgs[2] || getRuntimeProfileName();
    const result = await runConnectivityTest(profileName);
    printJson({
      profile: normalizeProfileName(profileName),
      ...result,
    });
    return;
  }
  if (forwardArgs[0] === 'config' && forwardArgs[1] === 'use') {
    const profileName = forwardArgs[2];
    if (!profileName) {
      throw new Error('用法: cumt config use <profile>');
    }
    const nextProfileName = await setActiveRuntimeProfile(profileName);
    process.stdout.write(
      `已切换到配置 ${nextProfileName}，无需重启，下一条消息立即生效。\n`,
    );
    return;
  }
  if (forwardArgs[0] === 'config' && forwardArgs[1] === 'apply-preset') {
    const presetId = forwardArgs[2];
    const profileName = forwardArgs[3] || getRuntimeProfileName();
    if (!presetId) {
      throw new Error('用法: cumt config apply-preset <preset> [profile]');
    }
    const nextConfig = await applyPresetToProfile(presetId, profileName);
    printJson(renderConfigSummary(normalizeProfileName(profileName), nextConfig));
    return;
  }
  if (forwardArgs[0] === 'config' && forwardArgs[1] === 'set-model') {
    const model = forwardArgs[2];
    const profileName = forwardArgs[3] || getRuntimeProfileName();
    if (!model) {
      throw new Error('用法: cumt config set-model <model> [profile]');
    }
    const nextConfig = await updateProfileModel(model, profileName);
    printJson(renderConfigSummary(normalizeProfileName(profileName), nextConfig));
    return;
  }
  if (forwardArgs[0] === 'config' && forwardArgs[1] === 'rm') {
    const profileName = forwardArgs[2];
    if (!profileName) {
      throw new Error('用法: cumt config rm <profile>');
    }
    await deleteRuntimeProfile(profileName);
    await clearRuntimeAuth(profileName);
    process.stdout.write(`已删除配置 ${normalizeProfileName(profileName)}\n`);
    return;
  }
  if (forwardArgs[0] === 'config' && forwardArgs[1] === 'init') {
    await initializeRuntimeHome();
    process.stdout.write(`已初始化运行目录 ${CUMT_RUNTIME_CONFIG_DIR}\n`);
    return;
  }
  if (forwardArgs[0] === 'config' && forwardArgs[1] === 'clear-auth') {
    await clearRuntimeAuth(forwardArgs[2] || null);
    process.stdout.write(`已更新认证文件 ${CUMT_AUTH_FILE}\n`);
    return;
  }
  if (forwardArgs[0] === 'config') {
    await runConfigWizard();
    return;
  }
  if (forwardArgs[0] === 'auth' && forwardArgs[1] === 'status') {
    await printAuthStatus();
    return;
  }
  if (await shouldAutoLaunchSetup(forwardArgs)) {
    await runSetupWizard();
    return;
  }
  if (isVersionMode(forwardArgs)) {
    await printVersion();
    return;
  }
  if (isHelpMode(forwardArgs)) {
    await runRuntimePassthrough(forwardArgs);
    return;
  }
  if (proxyOnly) {
    const { port } = await startProxyServer(DEFAULT_PROXY_PORT);
    process.stdout.write(`${renderBrandBanner(port)}\n`);
    return;
  }

  await runCumtViaProxy(forwardArgs);
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'unknown proxy failure'}\n`,
  );
  process.exit(1);
});
