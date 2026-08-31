import { invoke } from '@tauri-apps/api/core';

export interface LauncherState {
  nickname: string;
  raw_config: string;
  active_profile: string;
  profiles: string[];
  profile_configs: Record<string, string>;
  ram: number;
  discord_rpc?: boolean;
}

export interface ConfigInfo {
  raw_empty: boolean;
  profile: string;
  nickname: string;
  version: string;
  ram: string;
  uuid: string;
  java: string;
  game_dir: string;
  assets_dir: string;
}

export interface SkinResult {
  url: string;
  slim: boolean;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  download_url: string;
  size: number;
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
  percent: number;
  speed_mbps: number;
}

export interface ModSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  icon_url: string;
  downloads: number;
  follows: number;
  categories: string[];
}

export interface ModSearchResult {
  hits: ModSearchHit[];
  total: number;
}

export interface ModGalleryItem {
  url: string;
  raw_url: string;
  title: string;
  description: string;
}

export interface ModProjectInfo {
  project_id: string;
  title: string;
  description: string;
  body: string;
  icon_url: string;
  downloads: number;
  follows: number;
  categories: string[];
  gallery: ModGalleryItem[];
}

export interface ModVersion {
  id: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  file_name: string;
  file_url: string;
  file_size: number;
}

export interface InstalledContent {
  version_id: string;
  project_id: string;
  title: string;
  kind: string;
  file_name: string;
  path: string;
  version_number: string;
  installed_at: number;
}

export interface GameFile {
  file_name: string;
  path: string;
  kind: string;
  size: number;
  modified: number;
  from_launcher: boolean;
}

export interface GameVersionTag {
  version: string;
  version_type: string;
  date: string;
}

export interface LoaderTag {
  name: string;
  icon: string;
}

export interface BuiltinMod {
  id: string;
  title: string;
  description: string;
  author: string;
  version_number: string;
  mc_versions: string[];
  file_name: string;
  installed: boolean;
}

export const api = {
  getState: () => invoke<LauncherState>('get_state'),
  getConfigInfo: () => invoke<ConfigInfo>('get_config_info'),
  setNickname: (nickname: string) => invoke<LauncherState>('set_nickname', { nickname }),
  setRam: (ram: number) => invoke<LauncherState>('set_ram', { ram }),
  setDiscord: (enabled: boolean) => invoke<LauncherState>('set_discord', { enabled }),
  pasteConfig: (name: string, raw: string) =>
    invoke<LauncherState>('paste_config', { name, raw }),
  activateProfile: (name: string) => invoke<LauncherState>('activate_profile', { name }),
  renameProfile: (oldName: string, newName: string) =>
    invoke<LauncherState>('rename_profile', { oldName, newName }),
  deleteProfile: (name: string) => invoke<LauncherState>('delete_profile', { name }),
  captureConfig: () => invoke<string>('capture_config'),
  launchGame: () => invoke<number>('launch_game'),
  closeGame: () => invoke<boolean>('close_game'),
  cancelLaunch: () => invoke<boolean>('cancel_launch'),
  quitApp: () => invoke<void>('quit_app'),
  openGameDir: () => invoke<string>('open_game_dir'),
  fetchSkin: (nick: string) => invoke<SkinResult | null>('fetch_skin', { nick }),
  checkUpdate: () => invoke<UpdateInfo | null>('check_update'),
  downloadUpdate: (url: string) => invoke<string>('download_update', { url }),
  applyUpdate: () => invoke<void>('apply_update'),
  modrinthSearch: (query: string, projectType: string, gameVersion: string, offset: number) =>
    invoke<ModSearchResult>('modrinth_search', { query, projectType, gameVersion, offset }),
  modrinthProject: (projectId: string) => invoke<ModProjectInfo>('modrinth_project', { projectId }),
  modrinthProjects: (ids: string[]) => invoke<ModProjectInfo[]>('modrinth_projects', { ids }),
  modrinthVersions: (projectId: string, gameVersion: string) =>
    invoke<ModVersion[]>('modrinth_versions', { projectId, gameVersion }),
  modrinthGameVersions: () => invoke<GameVersionTag[]>('modrinth_game_versions'),
  modrinthLoaders: () => invoke<LoaderTag[]>('modrinth_loaders'),
  getModsPrefs: () => invoke<Record<string, string>>('get_mods_prefs'),
  setModsPrefs: (mcVersion: string, loader: string) =>
    invoke<void>('set_mods_prefs', { mcVersion, loader }),
  installModrinth: (p: {
    projectId: string;
    title: string;
    kind: string;
    versionId: string;
    versionNumber: string;
    fileName: string;
    fileUrl: string;
  }) => invoke<InstalledContent>('install_modrinth', p),
  getInstalled: () => invoke<InstalledContent[]>('get_installed'),
  uninstallContent: (versionId: string) =>
    invoke<InstalledContent[]>('uninstall_content', { versionId }),
  listGameFiles: () => invoke<GameFile[]>('list_game_files'),
  deleteGameFile: (path: string) => invoke<void>('delete_game_file', { path }),
  getBuiltinMods: () => invoke<BuiltinMod[]>('get_builtin_mods'),
  setBuiltinMod: (id: string, enabled: boolean) =>
    invoke<boolean>('set_builtin_mod', { id, enabled }),
};
