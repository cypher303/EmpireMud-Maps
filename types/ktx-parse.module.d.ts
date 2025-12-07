declare module 'three/examples/jsm/libs/ktx-parse.module.js' {
  export class KTX2Container {
    vkFormat: number;
    pixelWidth: number;
    pixelHeight: number;
    dataFormatDescriptor: Array<{
      vendorId: number;
      descriptorType: number;
      versionNumber: number;
      descriptorBlockSize: number;
      colorModel: number;
      colorPrimaries: number;
      transferFunction: number;
      flags: number;
      texelBlockDimension: number[];
      bytesPlane: number[];
      samples: Array<{
        channelType: number;
        bitOffset: number;
        bitLength: number;
        samplePosition: number[];
      }>;
    }>;
    levels: Array<{
      levelData: Uint8Array[];
      uncompressedByteLength: number;
    }>;
  }

  // Channel enums
  export const KHR_DF_CHANNEL_RGBSDA_ALPHA: number;
  export const KHR_DF_CHANNEL_RGBSDA_BLUE: number;
  export const KHR_DF_CHANNEL_RGBSDA_GREEN: number;
  export const KHR_DF_CHANNEL_RGBSDA_RED: number;

  // Models/primaries/transfer
  export const KHR_DF_MODEL_RGBSDA: number;
  export const KHR_DF_PRIMARIES_BT709: number;
  export const KHR_DF_PRIMARIES_UNSPECIFIED: number;
  export const KHR_DF_SAMPLE_DATATYPE_LINEAR: number;
  export const KHR_DF_SAMPLE_DATATYPE_SIGNED: number;
  export const KHR_DF_TRANSFER_LINEAR: number;
  export const KHR_DF_TRANSFER_SRGB: number;

  // Vulkan format enums we use
  export const VK_FORMAT_R8_UNORM: number;
  export const VK_FORMAT_R8_SRGB: number;
  export const VK_FORMAT_R8G8_UNORM: number;
  export const VK_FORMAT_R8G8_SRGB: number;
  export const VK_FORMAT_R8G8B8_UNORM: number;
  export const VK_FORMAT_R8G8B8_SRGB: number;
  export const VK_FORMAT_R8G8B8A8_UNORM: number;
  export const VK_FORMAT_R8G8B8A8_SRGB: number;
}
