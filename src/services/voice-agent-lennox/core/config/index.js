// Lennox model registry - minimal registry for controller compatibility

const modelRegistry = new Map()

const DEFAULT_MODEL = {
  id: 'lennox-ucp',
  name: 'Lennox UCP Agent'
}

modelRegistry.set(DEFAULT_MODEL.id, DEFAULT_MODEL)

export const getModelConfig = modelId => {
  if (!modelId) return null
  return modelRegistry.get(modelId) || null
}

export const getModelsInfo = () => {
  return Array.from(modelRegistry.values()).map(model => ({
    id: model.id,
    name: model.name
  }))
}

export const hasModel = modelId => {
  if (!modelId) return false
  return modelRegistry.has(modelId)
}

export const registerModel = config => {
  if (!config?.id || !config?.name) return
  modelRegistry.set(config.id, config)
}
