import { OIL_ANALYSIS_URL } from '../config';
import { newOperationId, postAction } from './client';

export type LpPoint = {
  LP_ID: string;
  Equipment_ID: string;
  Lubrication_Location: string;
  Point_Code: string;
  Lubrication_Point: string;
  Position?: string;
  Area?: string;
  Manufacturer?: string;
  Model?: string;
  Operating_Temperature_C?: number;
  Lubricant_Type?: string;
  Lubricant_Brand?: string;
  Lubricant_Quantity_L?: number;
  Oil_Analysis_Required: 'Yes' | 'No';
  Oil_Analysis_Interval?: string;
  Oil_Change_Interval?: string;
  Contractor: string;
  LP_Status: 'Active' | 'Inactive';
  Created_Date?: string;
  Modified_Date?: string;
};

export type LpPointFilters = { equipmentId?: string; oilAnalysisRequired?: boolean; status?: string };

export function listLpPoints(sessionToken: string, filters?: LpPointFilters): Promise<LpPoint[]> {
  return postAction<LpPoint[]>(OIL_ANALYSIS_URL, 'listLpPoints', { sessionToken, filters });
}

export function getLpPoint(sessionToken: string, lpId: string): Promise<LpPoint> {
  return postAction<LpPoint>(OIL_ANALYSIS_URL, 'getLpPoint', { sessionToken, lpId });
}

export type RoutineStatus = 'Assigned' | 'InProgress' | 'Submitted' | 'Approved';
export type ItemType = 'Change' | 'Top-up' | 'Sample';

export type Routine = {
  RoutineId: string;
  CreatedBy: string;
  AssignedTo: string;
  Contractor: string;
  CreatedDate: string;
  Status: RoutineStatus;
  SubmittedDate?: string;
  ApprovedBy?: string;
  ApprovedDate?: string;
  ACC_Comment?: string;
  ACC_CommentBy?: string;
  ACC_CommentDate?: string;
};

export type RoutineItem = {
  RoutineItemId: string;
  RoutineId: string;
  LP_ID: string;
  ItemType: ItemType;
  RequiredOilType?: string;
  Implemented: boolean | '';
  NotImplementedReason?: string;
  ActualDate?: string;
  ActualQuantity?: number;
  SampleTaken?: boolean | '';
  CreatedDate?: string;
  ModifiedDate?: string;
};

export type CreateRoutineInput = {
  assignedTo: string;
  contractorOrgId: string;
  items: { lpId: string; itemType: ItemType }[];
};

export function createRoutine(sessionToken: string, input: CreateRoutineInput): Promise<{ routineId: string }> {
  return postAction(OIL_ANALYSIS_URL, 'createRoutine', { sessionToken, input, operationId: newOperationId() });
}

export function getRoutine(sessionToken: string, routineId: string): Promise<{ routine: Routine; items: RoutineItem[] }> {
  return postAction(OIL_ANALYSIS_URL, 'getRoutine', { sessionToken, routineId });
}

export function listRoutines(
  sessionToken: string,
  filters?: { assignedToMe?: boolean; status?: RoutineStatus },
): Promise<Routine[]> {
  return postAction<Routine[]>(OIL_ANALYSIS_URL, 'listRoutines', { sessionToken, filters });
}

export type RoutineItemOutcome = {
  implemented: boolean;
  notImplementedReason?: string;
  actualDate?: string;
  actualQuantity?: number;
  sampleTaken?: boolean;
};

export function submitRoutineItem(
  sessionToken: string,
  routineItemId: string,
  outcome: RoutineItemOutcome,
): Promise<{ ok: true }> {
  return postAction(OIL_ANALYSIS_URL, 'submitRoutineItem', {
    sessionToken,
    routineItemId,
    outcome,
    operationId: newOperationId(),
  });
}

export function submitRoutine(sessionToken: string, routineId: string): Promise<{ ok: true }> {
  return postAction(OIL_ANALYSIS_URL, 'submitRoutine', { sessionToken, routineId, operationId: newOperationId() });
}

export function approveRoutine(sessionToken: string, routineId: string): Promise<{ ok: true }> {
  return postAction(OIL_ANALYSIS_URL, 'approveRoutine', { sessionToken, routineId, operationId: newOperationId() });
}

export function addAccComment(sessionToken: string, routineId: string, commentText: string): Promise<{ ok: true }> {
  return postAction(OIL_ANALYSIS_URL, 'addAccComment', {
    sessionToken,
    routineId,
    commentText,
    operationId: newOperationId(),
  });
}
