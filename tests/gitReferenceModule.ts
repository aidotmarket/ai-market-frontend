import { execFileSync } from 'node:child_process';
import { transpileModule, ModuleKind, JsxEmit } from 'typescript';

/** Execute an immutable reference with the same test dependencies as the candidate. */
export function gitReferenceModule<T>(path: string, dependencies: Record<string, unknown>): T {
  const source = execFileSync('rtk', ['proxy', 'git', 'show', `8074c2ca:${path}`], { encoding: 'utf8' });
  const { outputText } = transpileModule(source, { fileName: path,
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } });
  const referenceExports = {};
  const require = (name: string) => {
    if (!Object.hasOwn(dependencies, name)) throw new Error(`Unmapped reference dependency: ${name}`);
    return Object.defineProperty({ ...dependencies[name] as object }, '__esModule', { value: true });
  };
  new Function('require', 'exports', outputText)(require, referenceExports);
  return referenceExports as T;
}
