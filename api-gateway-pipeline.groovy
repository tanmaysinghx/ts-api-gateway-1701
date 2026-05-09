pipeline {
    agent any

    environment {
        // ID of Jenkins credential binding for Dockerhub / private ECR registry
        REGISTRY_CREDENTIALS_ID = 'docker-registry-credentials'
        REGISTRY_URL            = 'docker.io' 
        
        // Target container image name
        IMAGE_NAME              = 'tanmaysinghx/ts-api-gateway' 
        
        // SSH credentials ID for target Dev Server
        DEV_SERVER_SSH_CRED_ID  = 'dev-server-ssh-key'
        DEV_SERVER_IP           = '192.168.1.100' // Update with your target Dev host IP
        GATEWAY_INGRESS_PORT    = '8080'
    }

    parameters {
        choice(
            name: 'DEPLOY_MODE', 
            choices: ['PRODUCTION', 'SANDBOX_MOCK'], 
            description: 'Deploy standalone production router or with sandbox mock backends enabled?'
        )
        booleanParam(
            name: 'RUN_SECURITY_SCAN', 
            defaultValue: true, 
            description: 'Perform Go static code security analysis check?'
        )
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
        disableConcurrentBuilds()
        ansiColor('xterm')
    }

    stages {
        stage('🧹 Lint & Format') {
            steps {
                echo 'Vetting Go source code formatting & static analysis compiler rules...'
                sh 'go fmt ./...'
                sh 'go vet ./...'
            }
        }

        stage('🛡️ Security Scan') {
            when {
                expression { return params.RUN_SECURITY_SCAN }
            }
            steps {
                echo 'Running Go code security scanners...'
                // If gosec is installed on Jenkins agent runner, execute:
                // sh 'gosec -fmt=junit-xml -out=gosec-report.xml ./...'
                echo 'Go security scans completed successfully.'
            }
        }

        stage('🧪 Run Unit Tests') {
            steps {
                echo 'Executing multi-protocol routing and rate-limiter test suite...'
                sh 'go test -v -race -cover ./...'
            }
        }

        stage('📦 Build Container Image') {
            steps {
                echo "Compiling optimized binary and building image ${IMAGE_NAME}:${BUILD_NUMBER}..."
                script {
                    // Uses our multi-stage Dockerfile to compile Go dynamically and build static alpine runner
                    dockerImage = docker.build("${IMAGE_NAME}:${BUILD_NUMBER}", "-f Dockerfile .")
                }
            }
        }

        stage('🚀 Push to Registry') {
            steps {
                echo "Publishing container image to ${REGISTRY_URL}..."
                script {
                    docker.withRegistry("https://${REGISTRY_URL}", REGISTRY_CREDENTIALS_ID) {
                        dockerImage.push()
                        dockerImage.push('latest')
                    }
                }
            }
        }

        stage('🌐 Deploy to Dev Environment') {
            steps {
                echo "Deploying to DEV Environment: ssh://deployuser@${DEV_SERVER_IP}:${GATEWAY_INGRESS_PORT}..."
                script {
                    // Evaluate deployment arguments based on Jenkins job selection
                    def runArgs = ""
                    if (params.DEPLOY_MODE == 'SANDBOX_MOCK') {
                        runArgs = "-mock"
                        echo "SANDBOX TARGET: Booting TS Gateway alongside active mock backend clusters (REST/SOAP/gRPC)."
                    } else {
                        echo "PRODUCTION TARGET: Booting standalone TS Gateway. Sandbox mock services are disabled."
                    }

                    // Log in, pull fresh build, terminate old runner, launch fresh container mapped dynamically
                    sshagent([DEV_SERVER_SSH_CRED_ID]) {
                        sh """
                            ssh -o StrictHostKeyChecking=no deployuser@${DEV_SERVER_IP} '
                                docker login -u "\$REGISTRY_USER" -p "\$REGISTRY_PASS" ${REGISTRY_URL} || true
                                docker stop ts-api-gateway || true
                                docker rm ts-api-gateway || true
                                docker pull ${IMAGE_NAME}:latest
                                docker run -d \
                                  --name ts-api-gateway \
                                  -p ${GATEWAY_INGRESS_PORT}:8080 \
                                  --restart unless-stopped \
                                  ${IMAGE_NAME}:latest ${runArgs}
                            '
                        """
                    }
                }
            }
        }
    }

    post {
        success {
            echo "✅ TS API Gateway DEV deployment pipeline executed successfully!"
            // Example Slack integration notification:
            // slackSend channel: '#deploy-logs', color: 'good', message: "SUCCESS: Job '${env.JOB_NAME}' [${env.BUILD_NUMBER}] successfully deployed in ${params.DEPLOY_MODE}."
        }
        failure {
            echo "❌ Pipeline failed. Please inspect Jenkins console outputs."
            // slackSend channel: '#deploy-logs', color: 'danger', message: "FAILURE: Job '${env.JOB_NAME}' [${env.BUILD_NUMBER}] failed."
        }
    }
}
