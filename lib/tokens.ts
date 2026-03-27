import { v4 as uuidv4 } from 'uuid';

export const generateToken = (): string => uuidv4();
export const generateAdminToken = (): string => `admin_${uuidv4()}`;
