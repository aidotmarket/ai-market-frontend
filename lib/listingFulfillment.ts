export function isModelFulfillment(type: unknown): boolean {
  return type === 'model_access' || type === 'pipeline_invocation';
}
