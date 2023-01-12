import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild"
import * as iam from "aws-cdk-lib/aws-iam"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";

const githubSourceConfig = {
  owner: "simpsons01",
  repo: "CodebuildDemo",
}

interface IPullRequestBuildProjectConstructProps {
  cacheBucket: s3.Bucket
}
class PullRequestBuildProjectConstruct extends Construct  {
  component: {
    project: cdk.aws_codebuild.Project | null
  } = {
    project: null,
  }

  constructor(scope: Construct, id: string, props: IPullRequestBuildProjectConstructProps) {
    super(scope, id)

    this.component.project = new codebuild.Project(scope, "PullRequestBuildProject", {
      buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.pullrequest.yml"),
      projectName: "PullRequestBuild",
      source: codebuild.Source.gitHub({
        ...githubSourceConfig,
        reportBuildStatus: true,
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(
            codebuild.EventAction.PULL_REQUEST_CREATED,
            codebuild.EventAction.PULL_REQUEST_UPDATED,
            codebuild.EventAction.PULL_REQUEST_REOPENED,
          )
        ]
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
      },
      cache: codebuild.Cache.bucket(props.cacheBucket, { prefix: "pull_request" }),
    });

    this.component.project.enableBatchBuilds()
  
  }
}

interface IDeployBuildProjectConstructProps {
  cacheBucket: s3.Bucket,
  environmentVariables: {
    [key: string]: cdk.aws_codebuild.BuildEnvironmentVariable
  } 
}
class DeployBuildProjectConstruct extends Construct {
  component: {
    project: cdk.aws_codebuild.Project | null
  } = {
    project: null,
  }

  constructor(
    scope: Construct, 
    id: string, 
    props: IDeployBuildProjectConstructProps
  ) {
    super(scope, id)

    this.component.project = new codebuild.Project(scope, "DeployBuildProject", {
      buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.deploy.yml"),
      projectName: "DeployBuild",
      source: codebuild.Source.gitHub({
        ...githubSourceConfig,
        reportBuildStatus: true,
        webhookTriggersBatchBuild: true,
        webhookFilters: [
          codebuild.FilterGroup.inEventOf(
            codebuild.EventAction.PUSH,
          ).andHeadRefIs("(master)")
        ]
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
        environmentVariables: {
          ...props.environmentVariables
        },
      },
      cache: codebuild.Cache.bucket(props.cacheBucket, { prefix: "deploy" }),
    });

    this.component.project.enableBatchBuilds()
  }
}

export class DemoCodeBuildWithGithubActionDeploymentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const cacheBucket = new s3.Bucket(this, "CacheBucket") 
    const deployBucket = new s3.Bucket(this, "DeployBucket")

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

    const githubTokenSecretStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "secretsmanager:GetSecretValue"
      ],
      resources: [
        'arn:aws:secretsmanager:ap-northeast-1:171191418924:secret:GITHUB_PERSONAL_ACCESS_TOKEN-L5J3rs'
      ]
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

    const pullRequestBuildProject = new PullRequestBuildProjectConstruct(this, "PullRequestBuildProjectConstruct", {
      cacheBucket,
    });

    (pullRequestBuildProject.component.project as cdk.aws_codebuild.Project).addToRolePolicy(githubTokenSecretStatement);

    const deployBuildProject = new DeployBuildProjectConstruct(this, "DeployBuildProjectConstruct", {
      cacheBucket,
      environmentVariables: {
        DEPLOY_S3: {
          value: deployBucket.bucketName
        },
        CDN_URL: {
          value: cloudfrontDistribution.domainName
        }
      }
    });

    (deployBuildProject.component.project as cdk.aws_codebuild.Project).addToRolePolicy(deployS3BucketWritePolicyStatement);

    (deployBuildProject.component.project as cdk.aws_codebuild.Project).addToRolePolicy(cloudfrontPolicyStatement);

    (deployBuildProject.component.project as cdk.aws_codebuild.Project).addToRolePolicy(githubTokenSecretStatement);
  }
}