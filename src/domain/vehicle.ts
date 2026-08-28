import { modelLabel } from '../config';
import type { AppConfig, InspectionTemplate, ModelId, VehicleInfo } from '../types';

export function modelProfile(config: AppConfig, modelId: ModelId) {
  return config.models.find((model) => model.id === modelId) ?? config.models[0];
}

export function modelName(config: AppConfig, modelId: ModelId): string {
  const profile = config.models.find((model) => model.id === modelId);
  if (profile?.displayName?.trim()) return profile.displayName.trim();
  const known = modelLabel(modelId);
  if (known && known !== modelId) return known;
  return [profile?.make, profile?.model, profile?.generation, profile?.engine, profile?.transmission]
    .filter(Boolean)
    .join(' ') || modelId;
}

export function engineVariant(config: AppConfig, vehicle: Pick<VehicleInfo, 'modelId' | 'engineVariantId'>) {
  const model = modelProfile(config, vehicle.modelId);
  return model.engineVariants.find((variant) => variant.id === vehicle.engineVariantId)
    ?? model.engineVariants.find((variant) => variant.id === 'unknown')
    ?? model.engineVariants[0];
}

export function applicableTemplates(config: AppConfig, modelId: ModelId, engineVariantId?: string): InspectionTemplate[] {
  const modelTemplates = (config.templates ?? []).filter((template) => template.modelIds.includes(modelId));
  const exact = modelTemplates.filter((template) => !template.engineVariantIds?.length || !engineVariantId || template.engineVariantIds.includes(engineVariantId));
  return exact.length > 0 ? exact : modelTemplates.filter((template) => !template.engineVariantIds?.length);
}
