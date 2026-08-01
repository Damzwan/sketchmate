import type { Bounded } from "./committedLayer";
import { RenderOverviewCoordinator } from "./coordination/renderOverviewCoordinator";

export class RenderEngine<
	T extends Bounded,
> extends RenderOverviewCoordinator<T> {}

export type {
	RenderEngineOptions,
	Surface,
} from "./coordination/renderEngineBase";
