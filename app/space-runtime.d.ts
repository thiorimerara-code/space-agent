type SpaceExtend = typeof import("./L0/_all/mod/_core/framework/js/extensions.js").extend;
type SpaceCreateStore = typeof import("./L0/_all/mod/_core/framework/js/AlpineStore.js").createStore;
type SpaceYamlParse = typeof import("./L0/_all/mod/_core/framework/js/yaml-lite.js").parseSimpleYaml;
type SpaceYamlParseScalar = typeof import("./L0/_all/mod/_core/framework/js/yaml-lite.js").parseYamlScalar;
type SpaceYamlSerialize = typeof import("./L0/_all/mod/_core/framework/js/yaml-lite.js").serializeSimpleYaml;
type SpaceMarkdownParseDocument = typeof import("./L0/_all/mod/_core/framework/js/markdown-frontmatter.js").parseMarkdownDocument;

type SpaceApiQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

type SpaceApiCallOptions = {
  method?: string;
  query?: Record<string, SpaceApiQueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

type SpaceFileApiResult = {
  endpoint?: string;
  recursive?: boolean;
  paths?: string[];
  path: string;
  content?: string;
  encoding?: string;
  bytesWritten?: number;
};

type SpaceFileBatchApiResult = {
  bytesWritten?: number;
  count: number;
  files: SpaceFileApiResult[];
};

type SpacePathBatchApiResult = {
  count: number;
  paths: string[];
};

type SpaceFileReadInput =
  | string
  | {
      encoding?: string;
      path: string;
    };

type SpaceFileReadBatchOptions = {
  encoding?: string;
  files: SpaceFileReadInput[];
};

type SpaceFileWriteInput = {
  content?: string;
  encoding?: string;
  path: string;
};

type SpaceFileWriteBatchOptions = {
  encoding?: string;
  files: SpaceFileWriteInput[];
};

type SpaceFileDeleteInput =
  | string
  | {
      path: string;
    };

type SpaceFileDeleteBatchOptions = {
  paths: SpaceFileDeleteInput[];
};

type SpaceHealthResult = {
  ok: boolean;
  name: string;
  browserAppUrl: string;
  responsibilities: string[];
};

type SpaceUserSelfInfo = {
  fullName: string;
  groups: string[];
  isAdmin: boolean;
  managedGroups: string[];
  username: string;
};

type SpaceApi = {
  call<T = unknown>(endpointName: string, callOptions?: SpaceApiCallOptions): Promise<T>;
  fileDelete(path: string): Promise<SpaceFileApiResult>;
  fileDelete(path: SpaceFileDeleteInput): Promise<SpaceFileApiResult>;
  fileDelete(paths: SpaceFileDeleteInput[]): Promise<SpacePathBatchApiResult>;
  fileDelete(options: SpaceFileDeleteBatchOptions): Promise<SpacePathBatchApiResult>;
  fileList(path: string, recursive?: boolean): Promise<SpaceFileApiResult>;
  fileRead(path: string, encoding?: string): Promise<SpaceFileApiResult>;
  fileRead(file: SpaceFileReadInput): Promise<SpaceFileApiResult>;
  fileRead(files: SpaceFileReadInput[], encoding?: string): Promise<SpaceFileBatchApiResult>;
  fileRead(options: SpaceFileReadBatchOptions): Promise<SpaceFileBatchApiResult>;
  fileWrite(path: string, content?: string, encoding?: string): Promise<SpaceFileApiResult>;
  fileWrite(file: SpaceFileWriteInput): Promise<SpaceFileApiResult>;
  fileWrite(files: SpaceFileWriteInput[], encoding?: string): Promise<SpaceFileBatchApiResult>;
  fileWrite(options: SpaceFileWriteBatchOptions): Promise<SpaceFileBatchApiResult>;
  health(): Promise<SpaceHealthResult>;
  userSelfInfo(): Promise<SpaceUserSelfInfo>;
};

type SpaceFw = {
  createStore: SpaceCreateStore;
};

type SpaceYamlUtils = {
  parse: SpaceYamlParse;
  parseScalar: SpaceYamlParseScalar;
  serialize: SpaceYamlSerialize;
};

type SpaceMarkdownUtils = {
  parseDocument: SpaceMarkdownParseDocument;
};

type SpaceUtils = {
  markdown?: SpaceMarkdownUtils;
  yaml?: SpaceYamlUtils;
  [key: string]: any;
};

type SpaceRuntime = {
  api?: SpaceApi;
  extend: SpaceExtend;
  fw?: SpaceFw;
  utils?: SpaceUtils;
  [key: string]: any;
};

declare global {
  var space: SpaceRuntime;

  interface Window {
    space: SpaceRuntime;
  }
}

export {};
