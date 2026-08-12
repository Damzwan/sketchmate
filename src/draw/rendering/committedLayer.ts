import type { Bounded } from "./tiles/tileLayerBase";
import { TileStamps } from "./tiles/tileStamps";

export class CommittedLayer<T extends Bounded> extends TileStamps<T> {}

export type {
	Bounded,
	CommittedOptions,
	RemoteBakeFailure,
	RemoteBakeFailureReason,
	RemoteBakeResult,
	RemoteBaker,
	RemoteOverview,
	SpatialIndex,
	SplitTileRenderer,
	TileRenderer,
	WorldRect,
	Yieldable,
} from "./tiles/tileLayerBase";
