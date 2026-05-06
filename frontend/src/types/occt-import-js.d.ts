declare module 'occt-import-js' {
  interface OcctMesh {
    name?: string
    triangleCount: number
    triangleIndices: number[]
    vertices: number[]
    normals?: number[]
  }

  interface OcctResult {
    success: boolean
    meshes: OcctMesh[]
  }

  interface OcctInstance {
    ReadStepFile(buffer: Uint8Array, params: null): OcctResult
  }

  interface InitOptions {
    locateFile?: (filename: string) => string
  }

  function initOcctImportJs(options?: InitOptions): Promise<OcctInstance>
  export default initOcctImportJs
}
