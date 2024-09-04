import * as cdk from 'aws-cdk-lib';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import * as path from 'path';

export class CarbonCycleServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC
    const vpc = new ec2.Vpc(this, 'CarbonCycleVPC', {
      maxAzs: 2
    });

    // Create RDS instance
    const database = new rds.DatabaseInstance(this, 'CarbonCycleDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_13 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      databaseName: 'carboncycledb',
      credentials: rds.Credentials.fromGeneratedSecret('carboncycleuser'),
    });

    // Package NestJS application
    const appAsset = new s3assets.Asset(this, 'NestJSAppZip', {
      path: path.join(__dirname, '..', 'api'),
      bundling: {
        image: cdk.DockerImage.fromRegistry('public.ecr.aws/docker/library/node:18'),
        command: [
          '/bin/sh',
          '-c',
          'npm ci && npm run build && mkdir -p /asset-output && cp -r dist node_modules package.json /asset-output/'
        ],
        user: 'root',
      },
    });

    // Create Elastic Beanstalk application
    const app = new elasticbeanstalk.CfnApplication(this, 'CarbonCycleApp', {
      applicationName: 'carbon-cycle-app',
    });

    // Create application version
    const appVersion = new elasticbeanstalk.CfnApplicationVersion(this, 'AppVersion', {
      applicationName: app.applicationName || 'carbon-cycle-app',
      sourceBundle: {
        s3Bucket: appAsset.s3BucketName,
        s3Key: appAsset.s3ObjectKey,
      },
    });

    // Ensure the application version is created after the application
    appVersion.addDependency(app);

    // Create Elastic Beanstalk environment
    const environment = new elasticbeanstalk.CfnEnvironment(this, 'CarbonCycleEnvironment', {
      environmentName: 'CarbonCycleEnvironment',
      applicationName: app.applicationName || 'carbon-cycle-app',
      solutionStackName: '64bit Amazon Linux 2 v5.9.5 running Node.js 18',
      optionSettings: [
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'IamInstanceProfile',
          value: 'aws-elasticbeanstalk-ec2-role',
        },
        {
          namespace: 'aws:ec2:instances',
          optionName: 'InstanceTypes',
          value: 't3.micro',
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DATABASE_HOST',
          value: database.dbInstanceEndpointAddress,
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DATABASE_PORT',
          value: database.dbInstanceEndpointPort,
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DATABASE_NAME',
          value: 'carboncycledb',
        },
      ],
      versionLabel: appVersion.ref,
    });

    // Ensure the environment is created after the application version
    environment.addDependency(appVersion);

    // Output the database endpoint
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.dbInstanceEndpointAddress,
      description: 'The endpoint of the database',
    });

    // Output the Elastic Beanstalk environment URL
    new cdk.CfnOutput(this, 'EnvironmentUrl', {
      value: `http://${environment.attrEndpointUrl}`,
      description: 'The URL of the Elastic Beanstalk environment',
    });
  }
}