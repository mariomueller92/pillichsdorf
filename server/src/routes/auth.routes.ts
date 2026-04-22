import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate.js';
import { loginSchema, pinLoginSchema } from '../shared/schemas.js';
import * as authService from '../services/auth.service.js';
import { auth } from '../middleware/auth.js';

const router = Router();

router.post('/login', validate(loginSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = authService.loginWithCredentials(req.body.username, req.body.password);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/login-pin', validate(pinLoginSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = authService.loginWithPin(req.body.pin);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/me', auth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = authService.getUserFromToken(req.headers.authorization!.slice(7));
    res.json(user);
  } catch (err) { next(err); }
});

export default router;
