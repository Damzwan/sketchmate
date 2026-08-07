import Compressor from "compressorjs";

type CompressImgReturnType = "file" | "blob";

export interface CompressImgOptions {
	size?: number;
	quality?: number;
	returnType?: CompressImgReturnType;
}

const compressImgBaseSettings: CompressImgOptions = {
	quality: 0.6,
	returnType: "file",
};

export async function compressImg(
	file: File | Blob | string,
	options?: CompressImgOptions,
): Promise<Blob | File> {
	const o: CompressImgOptions = { ...compressImgBaseSettings, ...options };

	if (typeof file === "string") {
		file = await fetch(file).then((res) => res.blob());
	}

	return new Promise((resolve, reject) => {
		new Compressor(file as Blob | File, {
			quality: o.quality,
			maxWidth: o.size,
			maxHeight: o.size,
			mimeType: "image/webp",
			success(result) {
				if (o.returnType === "file") resolve(result as File);
				else if (o.returnType === "blob") resolve(result as Blob);
				else
					reject(new Error('Invalid returnType. Expected "blob" or "file".'));
			},
			error(err) {
				console.log(err.message);
				reject(err);
			},
		});
	});
}
