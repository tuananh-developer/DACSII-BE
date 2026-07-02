export interface JwtPayload {
    email: string;
    sub: string;
    role: string;
    branch_id?: string;
    userProfileId?: string;
}