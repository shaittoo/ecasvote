/*
 * SPDX-License-Identifier: Apache-2.0
 */

import {type Contract} from 'fabric-contract-api';
import {ECASVoteContract} from './ecasVote';

export const contracts: typeof Contract[] = [ECASVoteContract];
