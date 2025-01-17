import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { UserAuthTypeEnum } from '@/constants/common';
import { authGoogleToken } from '@/utils/plugin/google';
import requestIp from 'request-ip';
import { AuthCode } from '@/service/models/authCode';
import { connectToDatabase } from '@/service/mongo';
import { sendPhoneCode, sendEmailCode } from '@/service/utils/sendNote';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('123456789', 6);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { username, type, googleToken } = req.body as {
      username: string;
      type: `${UserAuthTypeEnum}`;
      googleToken: string;
    };

    if (!username || !type) {
      throw new Error('缺少参数');
    }

    // google auth
    global.systemEnv.googleServiceVerKey &&
      (await authGoogleToken({
        secret: global.systemEnv.googleServiceVerKey,
        response: googleToken,
        remoteip: requestIp.getClientIp(req) || undefined
      }));
    await connectToDatabase();
    
    // register switch
    if (type === UserAuthTypeEnum.register && !global.feConfigs?.show_register) {
      throw new Error('Register is closed');
    }

   const code = nanoid();

    // 判断 1 分钟内是否有重复数据
    const authCode = await AuthCode.findOne({
      username,
      type,
      expiredTime: { $gte: Date.now() + 4 * 60 * 1000 } // 如果有一个记录的过期时间，大于当前+4分钟，说明距离上次发送还没到1分钟。（因为默认创建时，过期时间是未来5分钟）
    });
    
    if (authCode) {
      throw new Error('请勿频繁获取验证码');
    }

    // 创建 auth 记录
    await AuthCode.create({
      username,
      type,
      code
    });

    if (username.includes('@')) {
      await sendEmailCode(username, code, type);
    } else {
      // 发送验证码
      await sendPhoneCode(username, code);
    }

    jsonRes(res, {
      message: '发送验证码成功'
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
