import { nextId } from '../db';
import type { HandlerInput, HandlerResult, MockDb, Route, UserRow } from '../types';
import type {
    AdminResult, ErrorResponse, LoginRequest, LoginResponse, User, UserCreateRequest, UserUpdateRequest,
} from '../../types/api';

const withoutPassword = ({ id, emp_id, eng_name, eng_surname, position }: UserRow): User =>
    ({ id, emp_id, eng_name, eng_surname, position });
const OK: HandlerResult<AdminResult> = { data: { result: 'OK' } };

export const authRoutes = (db: MockDb): Route[] => [
    {
        method: 'POST',
        path: '/login',
        handler: ({ body }: HandlerInput<LoginRequest>): HandlerResult<LoginResponse | ErrorResponse> => {
            const user = db.users.find((u) => u.emp_id === body.emp_id && u.password === body.password);
            if (!user) return { status: 401, data: { error: 'INVALID_CREDENTIALS' } };
            return { data: { result: 'OK', user: withoutPassword(user) } };
        },
    },
    {
        method: 'GET',
        path: '/login/users',
        handler: (): HandlerResult<User[]> => ({ data: db.users.map(withoutPassword) }),
    },
    {
        method: 'POST',
        path: '/login/users',
        handler: ({ body }: HandlerInput<UserCreateRequest>): HandlerResult<AdminResult> => {
            const { emp_id, eng_name, eng_surname, password, position } = body;
            db.users.push({ id: nextId(db.users), emp_id, eng_name, eng_surname, password, position });
            return OK;
        },
    },
    {
        method: 'PUT',
        path: '/login/users/:id',
        handler: ({ params, body }: HandlerInput<UserUpdateRequest>): HandlerResult<AdminResult> => {
            const user = db.users.find((u) => u.id === Number(params.id));
            if (user) Object.assign(user, { eng_name: body.eng_name, eng_surname: body.eng_surname, position: body.position });
            return OK;
        },
    },
    {
        method: 'DELETE',
        path: '/login/users/:id',
        handler: ({ params }: HandlerInput): HandlerResult<AdminResult> => {
            db.users = db.users.filter((u) => u.id !== Number(params.id));
            return OK;
        },
    },
];
