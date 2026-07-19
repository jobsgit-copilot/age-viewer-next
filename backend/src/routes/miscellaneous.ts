import express from 'express';
import { wrap } from '../common/Routes.ts';
import getQueryList from '../services/queryList.ts';
const router = express.Router();


router.get('/', wrap(getQueryList));

export default router;
