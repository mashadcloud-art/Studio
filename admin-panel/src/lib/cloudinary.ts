const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string

export interface CloudinaryResult {
  secure_url: string
  public_id: string
  width: number
  height: number
  format: string
}

/**
 * Upload a file to Cloudinary
 * @param file - File object from input
 * @param folder - Cloudinary folder (e.g. 'staff', 'work-photos', 'customers')
 * @param onProgress - Optional progress callback (0-100)
 */
export async function uploadToCloudinary(
  file: File,
  folder: string = 'nailuxe',
  onProgress?: (progress: number) => void
): Promise<CloudinaryResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', UPLOAD_PRESET)
  formData.append('folder', folder)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`))
      }
    }

    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(formData)
  })
}

/**
 * Upload an audio recording (voice note) to Cloudinary.
 * Cloudinary treats audio under its "video" resource type — there's no separate audio endpoint.
 */
export async function uploadAudioToCloudinary(
  file: Blob,
  folder: string = 'nailuxe/voice-notes',
  onProgress?: (progress: number) => void
): Promise<CloudinaryResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env')
  }

  const formData = new FormData()
  formData.append('file', file, 'voice-note.webm')
  formData.append('upload_preset', UPLOAD_PRESET)
  formData.append('folder', folder)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`))
      }
    }

    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(formData)
  })
}

/**
 * Get optimized Cloudinary URL
 */
export function getCloudinaryUrl(
  publicId: string,
  options: { width?: number; height?: number; quality?: string; format?: string } = {}
): string {
  const { width, height, quality = 'auto', format = 'auto' } = options
  const transforms = [
    `q_${quality}`,
    `f_${format}`,
    width ? `w_${width}` : '',
    height ? `h_${height}` : '',
    'c_limit',
  ].filter(Boolean).join(',')

  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transforms}/${publicId}`
}

export function isCloudinaryConfigured(): boolean {
  return !!CLOUD_NAME && !!UPLOAD_PRESET &&
    CLOUD_NAME !== 'your-cloud-name'
}
