import * as cdk from 'aws-cdk-lib'
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions'
import * as codecommit from 'aws-cdk-lib/aws-codecommit'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'

import { Construct } from 'constructs'

const app = new cdk.App()

class PipelineStack extends cdk.Stack {
  constructor(
    app: Construct,
    id: string,
    props: cdk.StackProps & { repositoryName: string }
  ) {
    super(app, id, props)

    const sourceOutput = new codepipeline.Artifact()

    const pipelineRole = new iam.Role(this, 'PipelineRole', {
      roleName: `${props.stackName}-reproduction-role`,
      description: `Role assumed by "${props.stackName}" pipeline`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('codebuild.amazonaws.com'),
        new iam.ServicePrincipal('codepipeline.amazonaws.com')
      ),
    })

    pipelineRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'apigateway:*',
          'cloudwatch:*',
          'cloudformation:*',
          'events:*',
          'iam:*',
          'lambda:*',
          'logs:*',
          's3:*',
          'route53:*',
          'acm:*',
          'cloudfront:*',
          'secretsmanager:*',
        ],
        effect: iam.Effect.ALLOW,
        resources: ['*'],
      })
    )

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      role: pipelineRole,
      pipelineName: props.stackName,
      crossAccountKeys: false,
    })

    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeCommitSourceAction({
          role: pipelineRole,
          codeBuildCloneOutput: true,
          repository: codecommit.Repository.fromRepositoryName(
            this,
            'MyRepo',
            props.repositoryName
          ),
          actionName: 'Checkout',
          branch: 'main',
          output: sourceOutput,
        }),
      ],
    })

    pipeline.addStage({
      stageName: 'CI',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'CI',
          input: sourceOutput,
          role: pipelineRole,
          project: new codebuild.PipelineProject(this, 'Build', {
            role: pipelineRole,
            cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
            projectName: props.stackName,
            environment: {
              // allows us specify node runtime version
              buildImage: codebuild.LinuxBuildImage.STANDARD_6_0,
            },
            buildSpec: codebuild.BuildSpec.fromObject({
              version: '0.2',
              phases: {
                install: {
                  'runtime-versions': {
                    nodejs: 16,
                  },
                  commands: ['n 18', 'npm ci', 'npm i -g nx'],
                },
                build: {
                  commands: [
                    // 'nx format:check',
                    // 'nx affected --target=lint --base=origin/main --parallel --max-parallel=3',
                    // 'nx affected --target=test --base=HEAD~1 --parallel --max-parallel=3 --configuration=ci',
                    // 'nx affected --target=build --base=HEAD~1 --parallel --max-parallel=3',
                    // 'nx affected --target=deploy --base=HEAD~1 --parallel --max-parallel=3 --stage dev',
                    // 'nx run-many --target=deploy --parallel --max-parallel=3 --verbose --stage dev',
                    'nx run my-lib:build --verbose',
                  ],
                },
              },
            }),
          }),
        }),
      ],
    })
  }
}

new PipelineStack(app, 'MyStack', {
  stackName: 'pnp-pipeline-reproduction',
  repositoryName: 'pnp-reproduction',
  env: {
    account: '352405683916',
    region: 'eu-west-1',
  },
})
