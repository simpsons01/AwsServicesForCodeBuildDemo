import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild"
import * as iam from "aws-cdk-lib/aws-iam"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as path from "path"

export class DemoCodeBuildWithGithubActionDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const deployBucket = new s3.Bucket(this, "DeployBucket")

    const deployS3BucketPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "s3:PutObject"
      ],
      resources: [
        `${deployBucket.bucketArn}/*`
      ]
    })

    const cloudfrontDistribution = new cloudfront.Distribution(this, "CloudfrontDistribution", {
      defaultBehavior: { 
        origin: new cloudfrontOrigins.S3Origin(deployBucket) 
      }
    });

    const cloudfrontPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "cloudfront:*"
      ],
      resources: ['*']
    })

    const githubTokenSecretManagerPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "secretsmanager:GetSecretValue"
      ],
      resources: [
        "arn:aws:secretsmanager:ap-northeast-1:171191418924:secret:GITHUB_PERSONAL_ACCESS_TOKEN-L5J3rs"
      ]
    })

    const codebuildProject = new codebuild.Project(this, "CodebuildProject", {
      projectName: "DemoCodeBuildWithGithubDeploymentStack",
      source: codebuild.Source.gitHub({
        owner: "simpsons01",
        repo: "CodebuildWithActionProject"
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
        environmentVariables: {
          DEPLOY_S3: {
            value: deployBucket.bucketName
          },
          CDN_URL: {
            value: cloudfrontDistribution.domainName
          }
        },
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE)
    });

    codebuildProject.enableBatchBuilds()

    codebuildProject.addToRolePolicy(deployS3BucketPolicyStatement)

    codebuildProject.addToRolePolicy(cloudfrontPolicyStatement)

    const codeBuildProjectPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "codebuild:*"
      ],
      resources: [
        codebuildProject.projectArn
      ]
    })

    const onBuildFailedRule = codebuildProject.onBuildFailed("CodeBuildFailedRule")

    const onCodeBuildFailLambdaFunc = new lambda.Function(this, 'CodeBuildFailLambdaFunc', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'onBuildFail.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lamdba/codebuild')),
    });

    onCodeBuildFailLambdaFunc.addToRolePolicy(githubTokenSecretManagerPolicyStatement)

    onBuildFailedRule.addTarget(new eventTargets.LambdaFunction(onCodeBuildFailLambdaFunc))

    const onBuildSuccessRule = codebuildProject.onBuildSucceeded("CodeBuildSuccessRule")

    const onCodeBuildSuccessLambdaFunc = new lambda.Function(this, 'CodeBuildSuccessLambdaFunc', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'onBuildSuccess.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lamdba/codebuild')),
      timeout: cdk.Duration.seconds(6)
    });

    onCodeBuildSuccessLambdaFunc.addToRolePolicy(githubTokenSecretManagerPolicyStatement)

    onCodeBuildSuccessLambdaFunc.addToRolePolicy(codeBuildProjectPolicyStatement)

    onBuildSuccessRule.addTarget(new eventTargets.LambdaFunction(onCodeBuildSuccessLambdaFunc))


  }
}