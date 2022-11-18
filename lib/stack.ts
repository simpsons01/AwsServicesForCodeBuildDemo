import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild"
import * as iam from "aws-cdk-lib/aws-iam"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from "path"

const githubSourceConfig = {
  owner: "simpsons01",
  repo: "CodebuildWithActionProject",
  reportBuildStatus: false
}

class PullRequestBuildProjectConstruct extends Construct  {
  component: {
    project: cdk.aws_codebuild.Project | null
    buildSucceededLambda: cdk.aws_lambda.Function | null
    buildFailedLambda: cdk.aws_lambda.Function | null
    logGroup: cdk.aws_logs.LogGroup | null
  } = {
    project: null,
    buildSucceededLambda: null,
    buildFailedLambda: null,
    logGroup: null
  }

  constructor(scope: Construct, id: string) {
    super(scope, id)

    this.component.logGroup = new logs.LogGroup(scope, 'PullRequestBuildProjectLogsGroup', {
      logGroupName: "/aws/codebuild/PullRequestBuild"
    });

    this.component.project = new codebuild.Project(scope, "PullRequestBuildProject", {
      buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.pullrequest.yml"),
      projectName: "PullRequestBuild",
      source: codebuild.Source.gitHub(githubSourceConfig),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
      logging: {
        cloudWatch:{
          logGroup: (this.component.logGroup as cdk.aws_logs.LogGroup)
        }
      }
    });
    
    // onBuildFailed
    const onBuildFailedRule = this.component.project.onBuildFailed("PullRequestBuildFailedRule")

    this.component.buildFailedLambda = new lambda.Function(scope, 'PullRequestBuildFailedLambdaFunc', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'onBuildFailed.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lamdba/codebuild/pullRequest')),
    });

    this.component.buildFailedLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "logs:*"
      ],
      resources: [
        this.component.logGroup.logGroupArn
      ]
    }))

    onBuildFailedRule.addTarget(new eventTargets.LambdaFunction(this.component.buildFailedLambda as cdk.aws_lambda.Function))

    // onBuildSucceeded
    const onBuildSucceededRule = this.component.project.onBuildSucceeded("PullRequestBuildSucceededRule")

    this.component.buildSucceededLambda = new lambda.Function(scope, 'PullRequestBuildSucceededLambdaFunc', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'onBuildSucceeded.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lamdba/codebuild/pullRequest')),
      timeout: cdk.Duration.seconds(6)
    });

    this.component.buildSucceededLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "logs:*"
      ],
      resources: [
        this.component.logGroup.logGroupArn
      ]
    }))

    onBuildSucceededRule.addTarget(new eventTargets.LambdaFunction(this.component.buildSucceededLambda as cdk.aws_lambda.Function))
  }
}

class DeployBuildProjectConstruct extends Construct {
  component: {
    project: cdk.aws_codebuild.Project | null
    buildSucceededLambda: cdk.aws_lambda.Function | null
    buildFailedLambda: cdk.aws_lambda.Function | null
    logGroup: cdk.aws_logs.LogGroup | null
  } = {
    project: null,
    buildSucceededLambda: null,
    buildFailedLambda: null,
    logGroup: null
  }

  constructor(
    scope: Construct, 
    id: string, 
    environmentVariables: {
      [key: string]: cdk.aws_codebuild.BuildEnvironmentVariable
    } 
  ) {
    super(scope, id)

    this.component.logGroup = new logs.LogGroup(scope, 'DeployBuildProjectLogsGroup', {
      logGroupName: "/aws/codebuild/DeployBuild"
    });

    this.component.project = new codebuild.Project(scope, "DeployBuildProject", {
      buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.deploy.yml"),
      projectName: "DeployBuild",
      source: codebuild.Source.gitHub(githubSourceConfig),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
        environmentVariables,
      },
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
      logging: {
        cloudWatch:{
          logGroup: (this.component.logGroup as cdk.aws_logs.LogGroup)
        }
      }
    });

    this.component.project.enableBatchBuilds()

    // onBuildFailed
    const onBuildFailedRule = this.component.project.onBuildFailed("DeployBuildFailedRule")

    this.component.buildFailedLambda = new lambda.Function(scope, 'DeployBuildFailedLambdaFunc', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'onBuildFailed.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lamdba/codebuild/deploy')),
    });

    this.component.buildFailedLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "logs:*"
      ],
      resources: [
        this.component.logGroup.logGroupArn
      ]
    }))

    onBuildFailedRule.addTarget(new eventTargets.LambdaFunction(this.component.buildFailedLambda as cdk.aws_lambda.Function))

    // onBuildSucceeded
    const onBuildSucceededRule = this.component.project.onBuildSucceeded("DeployBuildSucceededRule")

    this.component.buildSucceededLambda = new lambda.Function(scope, 'DeployBuildSucceededLambdaFunc', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'onBuildSucceeded.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lamdba/codebuild/deploy')),
      timeout: cdk.Duration.seconds(6)
    });

    this.component.buildSucceededLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "codebuild:*"
      ],
      resources: [
        this.component.project.projectArn
      ]
    }))

    this.component.buildSucceededLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "logs:*"
      ],
      resources: [
        this.component.logGroup.logGroupArn
      ]
    }))

    onBuildSucceededRule.addTarget(new eventTargets.LambdaFunction(this.component.buildSucceededLambda as cdk.aws_lambda.Function))
  }
}

export class DemoCodeBuildWithGithubActionDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const deployBucket = new s3.Bucket(this, "DeployBucket")

    const logBucket = new s3.Bucket(this, "logBucket", {
      bucketName: "demo-github-action-with-codebuild-log-bucket"
    })

    const restrictGetS3ObjectIpRangePolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.AnyPrincipal()],
      actions: [
        "s3:GetObject"
      ],
      resources: [
        `${logBucket.bucketArn}/*`
      ],
      conditions: {
        IpAddress: {
          "aws:SourceIp": [
            "60.251.45.137/32",
            "60.251.45.138/32",
            "61.221.166.143/32",
            "122.146.84.168/32",
            "122.146.84.173/32",
            "122.146.87.200/32",
            "219.87.140.198/32",
            "202.8.15.185/32",
            "113.196.177.240/32"
          ]
        }
      }
    })

    logBucket.addToResourcePolicy(restrictGetS3ObjectIpRangePolicyStatement)

    const cloudfrontDistribution = new cloudfront.Distribution(this, "CloudfrontDistribution", {
      defaultBehavior: { 
        origin: new cloudfrontOrigins.S3Origin(deployBucket) 
      }
    });

    const GetSecretManagerPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "secretsmanager:GetSecretValue"
      ],
      resources: [
        "arn:aws:secretsmanager:ap-northeast-1:171191418924:secret:GITHUB_PERSONAL_ACCESS_TOKEN-L5J3rs",
        "arn:aws:secretsmanager:ap-northeast-1:171191418924:secret:SLACK_APP_BOT_TOKEN-UMa3KN"
      ]
    })

    const cloudfrontPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "cloudfront:*"
      ],
      resources: ['*']
    })

    const deployS3BucketWritePolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "s3:PutObject"
      ],
      resources: [
        `${deployBucket.bucketArn}/*`
      ]
    })

    const logS3BucketWritePolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "s3:PutObject"
      ],
      resources: [
        `${logBucket.bucketArn}/*`
      ]
    })

    const pullRequestBuildProject = new PullRequestBuildProjectConstruct(this, "PullRequestBuildProjectConstruct");

    (pullRequestBuildProject.component.project as cdk.aws_codebuild.Project).addToRolePolicy(GetSecretManagerPolicyStatement);

    (pullRequestBuildProject.component.buildSucceededLambda as cdk.aws_lambda.Function).addToRolePolicy(GetSecretManagerPolicyStatement);

    (pullRequestBuildProject.component.buildSucceededLambda as cdk.aws_lambda.Function).addToRolePolicy(logS3BucketWritePolicyStatement);

    (pullRequestBuildProject.component.buildFailedLambda as cdk.aws_lambda.Function).addToRolePolicy(GetSecretManagerPolicyStatement);

    (pullRequestBuildProject.component.buildFailedLambda as cdk.aws_lambda.Function).addToRolePolicy(logS3BucketWritePolicyStatement);

    const deployBuildProject = new DeployBuildProjectConstruct(this, "DeployBuildProjectConstruct", {
      DEPLOY_S3: {
        value: deployBucket.bucketName
      },
      CDN_URL: {
        value: cloudfrontDistribution.domainName
      }
    });

    (deployBuildProject.component.project as cdk.aws_codebuild.Project).addToRolePolicy(GetSecretManagerPolicyStatement);

    (deployBuildProject.component.project as cdk.aws_codebuild.Project).addToRolePolicy(deployS3BucketWritePolicyStatement);

    (deployBuildProject.component.project as cdk.aws_codebuild.Project).addToRolePolicy(cloudfrontPolicyStatement);

    (deployBuildProject.component.buildSucceededLambda as cdk.aws_lambda.Function).addToRolePolicy(GetSecretManagerPolicyStatement);

    (deployBuildProject.component.buildSucceededLambda as cdk.aws_lambda.Function).addToRolePolicy(logS3BucketWritePolicyStatement);

    (deployBuildProject.component.buildFailedLambda as cdk.aws_lambda.Function).addToRolePolicy(GetSecretManagerPolicyStatement);

    (deployBuildProject.component.buildFailedLambda as cdk.aws_lambda.Function).addToRolePolicy(logS3BucketWritePolicyStatement);
  }
}