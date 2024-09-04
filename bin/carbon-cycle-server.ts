#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CarbonCycleServerStack } from '../lib/carbon-cycle-server-stack';

const app = new cdk.App();
new CarbonCycleServerStack(app, 'CarbonCycleServerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});