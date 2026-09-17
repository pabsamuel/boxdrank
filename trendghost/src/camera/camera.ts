/** getUserMedia, with honest failure states (Phase 1 scope). */

export type CameraError =
  'permission-denied' | 'no-camera' | 'insecure-context' | 'unsupported' | 'unknown';

export interface CameraStream {
  stream: MediaStream;
  video: HTMLVideoElement;
  width: number;
  height: number;
}

export function describeCameraError(error: CameraError): string {
  switch (error) {
    case 'permission-denied':
      return 'Camera access was blocked. Allow the camera in your browser settings, then reload.';
    case 'no-camera':
      return 'No camera found on this device.';
    case 'insecure-context':
      return 'Cameras only work over HTTPS (or on localhost). Open this page over https://.';
    case 'unsupported':
      return "This browser can't open the camera. Try Chrome or Safari.";
    default:
      return 'Something went wrong opening the camera.';
  }
}

export async function openCamera(facing: 'user' | 'environment' = 'user'): Promise<CameraStream> {
  if (!window.isSecureContext) throw 'insecure-context' as CameraError;
  if (!navigator.mediaDevices?.getUserMedia) throw 'unsupported' as CameraError;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
  } catch (error) {
    throw mapError(error);
  }

  const video = document.createElement('video');
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();

  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings() ?? {};

  return {
    stream,
    video,
    width: settings.width ?? video.videoWidth,
    height: settings.height ?? video.videoHeight,
  };
}

export function closeCamera(camera: CameraStream | null): void {
  camera?.stream.getTracks().forEach((track) => track.stop());
}

function mapError(error: unknown): CameraError {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission-denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-camera';
  if (name === 'NotSupportedError') return 'unsupported';
  return 'unknown';
}
