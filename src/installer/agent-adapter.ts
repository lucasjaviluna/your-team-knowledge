export type InstructionScope = "local" | "global" | "both";

export interface InstallerContext {
  root: string;
  userHome: string;
  environment: NodeJS.ProcessEnv;
  projectId: string;
  databaseFile: string;
  executableFile: string;
  nodeExecutable: string;
  instructionScope: InstructionScope;
  area?: string;
}

export interface FileChange {
  filename: string;
  content: string | null;
}

/** A host adapter owns only its host-specific files and managed sections. */
export interface AgentInstallerAdapter {
  readonly name: string;
  install(context: InstallerContext): readonly FileChange[];
  uninstall(context: InstallerContext): readonly FileChange[];
}
