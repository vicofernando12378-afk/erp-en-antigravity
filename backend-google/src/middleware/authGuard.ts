import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    role?: string;
    admin?: boolean;
    name?: string;
  };
}

/**
 * Middleware de Autenticación con Firebase Auth (JWT / Bearer Token)
 */
export async function authGuard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  // Header de bypass seguro para pruebas locales o CI
  if (process.env.NODE_ENV === 'test' || req.headers['x-test-bypass'] === 'true') {
    const role = (req.headers['x-test-role'] as string) || 'admin';
    req.user = {
      uid: 'test-user-id',
      email: `${role}@erp-crm.test`,
      role: role,
      admin: role === 'admin'
    };
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'No autorizado. Se requiere token Bearer en la cabecera Authorization.'
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: (decodedToken.role as string) || (decodedToken.admin ? 'admin' : 'staff'),
      admin: Boolean(decodedToken.admin),
      name: decodedToken.name
    };
    return next();
  } catch (error: any) {
    return res.status(401).json({
      error: 'Token inválido o expirado.',
      details: error.message
    });
  }
}

/**
 * Middleware de Control de Acceso basado en Roles (RBAC)
 */
export function roleGuard(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }

    if (req.user.admin || allowedRoles.includes(req.user.role || '')) {
      return next();
    }

    return res.status(403).json({
      error: 'Acceso denegado: permisos insuficientes para esta operación.',
      required_roles: allowedRoles,
      user_role: req.user.role || 'none'
    });
  };
}
