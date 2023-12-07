/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as google from 'googleapis';
import {logger} from 'firebase-functions/v1';
import {QueryDocumentSnapshot} from 'firebase-admin/firestore';

import {ScheduledBackups} from '../utils/scheduled_backups';
import {RestoreError, RestoreStatus} from '../models/restore_status';
import {RestoreJobData} from '../models/restore_job_data';
import {firestore} from 'firebase-admin';
import {GaxiosError} from 'googleapis-common';

const scheduledBackups = new ScheduledBackups();

export const triggerRestorationJobHandler = async (
  snapshot: QueryDocumentSnapshot
) => {
  const ref = snapshot.ref;
  const data = snapshot.data() as RestoreJobData | undefined;
  const timestamp = data?.timestamp as firestore.Timestamp | undefined;

  if (!timestamp || !isValidTimestamp(timestamp)) {
    logger.error(
      '"timestamp" field is missing, please ensure that you are sending a valid timestamp in the request body, is in seconds since epoch and is not in the future.'
    );

    await scheduledBackups.updateRestoreJobDoc(ref, {
      status: {
        message: RestoreStatus.FAILED,
        error: RestoreError.INVALID_TIMESTAMP,
      },
    });

    return;
  }

  if (!data?.destinationDatabaseId) {
    logger.error(
      '"destinationDatabaseId" field is missing, please ensure that you are sending a valid database ID in the request body.'
    );

    await scheduledBackups.updateRestoreJobDoc(ref, {
      status: {
        message: RestoreStatus.FAILED,
        error: RestoreError.INVALID_TIMESTAMP,
      },
    });

    return;
  }

  let backups: google.firestore_v1.Schema$GoogleFirestoreAdminV1Backup[];

  // Check if there's a valid backup
  try {
    backups = await scheduledBackups.checkIfBackupExists('(default)');
  } catch (ex: any) {
    logger.error('Error getting backup', ex);
    await scheduledBackups.updateRestoreJobDoc(ref, {
      status: {
        message: RestoreStatus.FAILED,
        error: `${RestoreError.BACKUP_NOT_FOUND}`,
      },
    });

    return;
  }

  // Pick the closest backup to the requested timestamp
  const backup = pickClosestBackup(backups, timestamp);

  // The destination database already exists, delete it before restoring
  await scheduledBackups.deleteExistingDestinationDatabase(
    data?.destinationDatabaseId
  );

  // Call restore function to build the baseline DB
  try {
    const operation = await scheduledBackups.restoreBackup(
      data?.destinationDatabaseId,
      backup.name as string
    );

    await scheduledBackups.updateRestoreJobDoc(ref, {
      status: {
        message: RestoreStatus.RUNNING_RESTORE,
      },
      operation: operation,
    });
  } catch (ex: any) {
    logger.error('Error restoring backup', (ex as GaxiosError).message);
    await scheduledBackups.updateRestoreJobDoc(ref, {
      status: {
        message: RestoreStatus.FAILED,
        error: `${RestoreError.EXCEPTION}: ${(ex as GaxiosError).message}`,
      },
    });

    return;
  }
};

/**
 * Checks if a long integer is a valid UNIX timestamp in seconds.
 *
 * @param timestamp The timestamp to check.
 * @returns Whether the timestamp is valid.
 */
function isValidTimestamp(timestamp: firestore.Timestamp): boolean {
  // Get the current UNIX timestamp
  const currentTimestamp = firestore.Timestamp.now().toMillis();

  // Ensure the timestamp isn't in the future
  if (timestamp.toMillis() > currentTimestamp) {
    return false;
  }

  return true;
}

function pickClosestBackup(
  backups: google.firestore_v1.Schema$GoogleFirestoreAdminV1Backup[],
  timestamp: firestore.Timestamp
) {
  return backups.reduce((prev, curr) => {
    const prevDiff = Math.abs(
      timestamp.toMillis() - new Date(prev.snapshotTime as string).getTime()
    );
    const currDiff = Math.abs(
      timestamp.toMillis() - new Date(curr.snapshotTime as string).getTime()
    );

    return prevDiff < currDiff ? prev : curr;
  });
}
