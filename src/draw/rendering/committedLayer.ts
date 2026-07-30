import { TileStamps } from "./tiles/tileStamps";
import type { Bounded } from "./tiles/tileLayerBase";

export class CommittedLayer<T extends Bounded> extends TileStamps<T> {}

export type {
	Bounded,
	CommittedOptions,
	RemoteBaker,
	RemoteBakeResult,
	RemoteOverview,
	SpatialIndex,
	TileRenderer,
	WorldRect,
	Yieldable,
} from "./tiles/tileLayerBase";
