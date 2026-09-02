import type { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<{
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: 'ADMIN';
  active: boolean;
}>;
