import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth.js';
import { role } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { createUserSchema, updateUserSchema } from '../shared/schemas.js';
import * as usersService from '../services/users.service.js';

const router = Router();

router.use(auth, role(['admin']));

router.get('/', (req: Request, res: Response) => {
  const users = usersService.listUsers(req.query.role as string | undefined);
  res.json(users);
});

router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = usersService.getUser(parseInt(req.params.id));
    res.json(user);
  } catch (err) { next(err); }
});

router.post('/', validate(createUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await usersService.createUser(req.body);
    res.status(201).json(user);
  } catch (err) { next(err); }
});

router.put('/:id', validate(updateUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await usersService.updateUser(parseInt(req.params.id), req.body);
    res.json(user);
  } catch (err) { next(err); }
});

router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    usersService.deleteUser(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
