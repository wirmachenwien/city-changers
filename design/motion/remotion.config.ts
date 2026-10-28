/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
// Preserve the alpha channel for overlay exports. Pick ProRes 4444 or VP9
// in Studio; ordinary H.264/MP4 does not support transparency.
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
