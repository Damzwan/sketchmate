import imageCompression from 'browser-image-compression';

export function sortDates(arr: string[]) {
  return arr.sort((a, b) => {
    return new Date(b).getTime() - new Date(a).getTime();
  });
}

export async function createProfilePicture(img: File) {
  const options = {
    maxSizeMB: 0.2,
    maxWidthOrHeight: 200,
    useWebWorker: true,
  };
  return await imageCompression(img, options);
}
