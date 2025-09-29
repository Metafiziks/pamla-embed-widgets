// lib/abi/index.ts
import type { Abi } from 'viem';

import AccessControllerJson from './AccessController.json';
import BondingCurveTokenJson from './BondingCurveToken.json';
import PointsManagerJson from './PointsManager.json';
import SongTokenRegistryJson from './SongTokenRegistry.json';

export const AccessControllerABI = AccessControllerJson.abi as Abi;
export const TokenABI           = BondingCurveTokenJson.abi as Abi;
export const PointsManagerABI   = PointsManagerJson.abi as Abi;
export const RegistryABI        = SongTokenRegistryJson.abi as Abi;
