const { network, ethers } = require("hardhat")
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-cofig")
const { expect, assert } = require("chai")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("lottery", async function () {
          let lottery, deployer
          let LotteryEntrenceFee, interval

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              lottery = await ethers.getContract("lottery", deployer)
              LotteryEntrenceFee = await lottery.getEntrenceFee()
              interval = await lottery.getInterval()
          })

          describe("fulfillRandomWords", function () {
              it("Shold work with live chainlink keeprs and chainlink vrf, we get a random winner", async function () {
                  const startingTimeStamp = await lottery.getLatestTimeStamps()
                  const accounts = await ethers.getSigners()

                  //set the listner
                  await new Promise(async (resolve, reject) => {
                      lottery.once("WinnerPicked", async function () {
                          console.log("winner picked event fired!")
                          try {
                              const recentWinner =
                                  await lottery.getRecentWinner()
                              const lotteryState =
                                  await lottery.getLotteryState()
                              const winnerEndBalance =
                                  await accounts[0].getBalance()
                              const EndTimeStamp =
                                  await lottery.getLatestTimeStamps()

                              await expect(lottery.getPlayer(0)).to.be.reverted

                              console.log("ENDING BALANCE ", winnerEndBalance)
                              assert.equal(
                                  recentWinner.toString(),
                                  accounts[0].address
                              )
                              assert.equal(lotteryState.toString(), "0")
                              assert.equal(
                                  winnerEndBalance.toString(),
                                  winnerStartingBalance
                                      .add(LotteryEntrenceFee)
                                      .toString()
                              )
                              assert(EndTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })
                      console.log("Entering lottery....")
                      const tx = await lottery.enterLottery({
                          value: LotteryEntrenceFee,
                      })
                      await tx.wait(1)
                      console.log("Lottery Entered !")
                      const winnerStartingBalance =
                          await accounts[0].getBalance()
                      console.log("INITIAL BALANCE ", winnerStartingBalance)
                  })
              })
          })
      })
