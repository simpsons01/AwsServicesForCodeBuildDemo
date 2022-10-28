#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DemoCodeBuildWithGithubActionDeploymentStack } from '../lib/stack';

const app = new cdk.App();
new DemoCodeBuildWithGithubActionDeploymentStack(app, 'DemoCodeBuildWithGithubActionDeploymentStack');
app.synth()