import { auth, db, COLLECTIONS } from '../../config/firebase';

export interface CreateUserDto {
  email: string;
  password?: string;
  name: string;
  role: 'admin' | 'staff' | 'manager' | 'customer';
  phone?: string;
}

export class UserService {
  /**
   * Crear usuario en Firebase Auth y asignarle Custom Claims de rol
   */
  static async createUser(dto: CreateUserDto) {
    // 1. Crear usuario en Firebase Authentication (si está habilitado en la consola)
    let uid = `user_${Date.now()}`;
    let customClaims = {
      role: dto.role,
      admin: dto.role === 'admin'
    };

    try {
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(dto.email);
        uid = userRecord.uid;
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          userRecord = await auth.createUser({
            email: dto.email,
            password: dto.password || 'ErpCrm2026!',
            displayName: dto.name,
            phoneNumber: dto.phone
          });
          uid = userRecord.uid;
        } else {
          throw err;
        }
      }

      // 2. Asignar Custom Claims para RBAC en Auth
      await auth.setCustomUserClaims(uid, customClaims);
    } catch (authErr: any) {
      if (authErr.code === 'auth/configuration-not-found') {
        console.warn('ℹ️ Firebase Auth aún no ha sido activado en la consola. Creando usuario en Firestore erp_users...');
      } else {
        console.warn('⚠️ Nota sobre Firebase Auth:', authErr.message);
      }
    }

    // 3. Guardar perfil en colección Firestore erp_users
    const userDoc = {
      uid: uid,
      email: dto.email,
      name: dto.name,
      role: dto.role,
      is_admin: dto.role === 'admin',
      is_active: true,
      created_at: new Date()
    };
    await db.collection(COLLECTIONS.USERS).doc(uid).set(userDoc);

    return {
      success: true,
      uid: uid,
      email: dto.email,
      role: dto.role,
      claims: customClaims
    };
  }

  /**
   * Obtener perfil y claims del usuario
   */
  static async getUserProfile(uid: string) {
    const userRecord = await auth.getUser(uid);
    const docSnap = await db.collection(COLLECTIONS.USERS).doc(uid).get();

    return {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      customClaims: userRecord.customClaims,
      profile: docSnap.exists ? docSnap.data() : null
    };
  }
}
